import {
    fromB64,
    fromUtf8,
    generateIdentity,
    generateKeyPair,
    randomBytes,
    sign,
    toB64,
    utf8,
} from "./primitives.js"
import * as ratchet from "./ratchet.js"
import { loadDevice, loadSession, saveDevice, saveSession } from "./storage.js"
import { initiate, respond } from "./x3dh.js"

/* The seam between the messages store and the protocol: sessions in, envelopes out.
 * This module holds no state of its own — the device record and every session live in
 * `storage.js` — and it never fetches: the store brings it bundles and carries away
 * registration payloads, because `lib/api.js` is the only thing in the app that talks
 * HTTP and this module is beneath the store in the layering.
 *
 * ── Sessions ─────────────────────────────────────────────────────────────────
 *
 * One record per remote *device* (not per person — a session is between two
 * installations), shaped `{ active, archived, pending, baseKey }`:
 *
 *  - `active` is the ratchet state messages encrypt under and decrypt against first.
 *  - `archived` is the previous active one, tried when the active fails. It exists
 *    for the crossing-hello race: two people open a thread to each other at once,
 *    each processes the other's PREKEY envelope, and each side's initiator session is
 *    displaced by its responder one — the archived slot is what still decrypts the
 *    messages the displaced session sent before the swap arrived.
 *  - `pending` is the X3DH handshake we owe the other side: kept from the first
 *    encrypt until something from them decrypts, and stamped onto every outgoing
 *    envelope meanwhile (as a PREKEY frame), because until they have processed one we
 *    cannot know they can read anything else. That is Signal's own rule.
 *  - `baseKey` is the initiator ephemeral of the handshake the active session came
 *    from, and it is what makes a *duplicate* PREKEY envelope (a resend, an
 *    out-of-order arrival) decrypt on the existing session instead of re-running
 *    X3DH against a one-time prekey that was consumed the first time.
 *
 * Ratchet states mutate in place, so every decrypt attempt runs on a structuredClone
 * and only a success is written back — a failed attempt must leave the stored state
 * exactly as it was. */

const PREKEY_POOL = 30
export const PREKEY_LOW_WATER = 10

/* ---------------------------------------------------------------------------
 * Device
 * ------------------------------------------------------------------------- */

const createDevice = () => {
    const identity = generateIdentity()
    const signedPreKey = generateKeyPair()
    const device = {
        id: globalThis.crypto.randomUUID(),
        /* 14 bits, per the Signal wire format's range. */
        registrationId: ((randomBytes(2)[0] << 8) | randomBytes(1)[0]) % 16380 + 1,
        identity: { secretKey: toB64(identity.secretKey), publicKey: toB64(identity.publicKey) },
        signedPreKey: {
            keyId: 1,
            secretKey: toB64(signedPreKey.secretKey),
            publicKey: toB64(signedPreKey.publicKey),
            signature: toB64(sign(identity.secretKey, signedPreKey.publicKey)),
        },
        oneTimePreKeys: {},
        nextPreKeyId: 1,
        /* Highest keyId the server has been sent. Registration only ships keys above
         * it, because the server's pool is append-only — see `registerCryptoDevice`
         * for the failure re-uploading an old key produces. */
        publishedThrough: 0,
    }
    return mintPreKeys(device, PREKEY_POOL)
}

const mintPreKeys = (device, count) => {
    for (let i = 0; i < count; i++) {
        const pair = generateKeyPair()
        device.oneTimePreKeys[device.nextPreKeyId] = {
            secretKey: toB64(pair.secretKey),
            publicKey: toB64(pair.publicKey),
        }
        device.nextPreKeyId += 1
    }
    return device
}

/* The wire shape `POST /api/messages/keys` takes: everything public, nothing secret.
 * Only keys above the published watermark ride along — see `publishedThrough`. */
const registrationPayload = (device) => ({
    deviceId: device.id,
    registrationId: device.registrationId,
    identityKey: device.identity.publicKey,
    signedPreKeyId: device.signedPreKey.keyId,
    signedPreKey: device.signedPreKey.publicKey,
    signedPreKeySignature: device.signedPreKey.signature,
    oneTimePreKeys: Object.entries(device.oneTimePreKeys)
        .filter(([keyId]) => Number(keyId) > device.publishedThrough)
        .map(([keyId, pair]) => ({ keyId: Number(keyId), key: pair.publicKey })),
})

/* Loads or creates this installation's device, returning the payload the store must
 * register it with. */
export const ensureDevice = async (profileId) => {
    let device = await loadDevice(profileId)
    if (!device) {
        device = createDevice()
        await saveDevice(profileId, device)
    }
    return { deviceId: device.id, registration: registrationPayload(device) }
}

/* Advances the watermark once a registration POST succeeded — before that, the keys
 * it carried are not on the server and must go again next boot. */
export const markPublished = async (profileId) => {
    const device = await loadDevice(profileId)
    if (!device) return
    device.publishedThrough = device.nextPreKeyId - 1
    await saveDevice(profileId, device)
}

/* Called with the server's count of unspent one-time prekeys; mints replacements when
 * the pool runs low and hands back the fresh registration to re-post, or null when
 * nothing needs doing. */
export const topUpPreKeys = async (profileId, remaining) => {
    if (remaining >= PREKEY_LOW_WATER) return null
    const device = await loadDevice(profileId)
    if (!device) return null
    mintPreKeys(device, PREKEY_POOL - remaining)
    await saveDevice(profileId, device)
    return registrationPayload(device)
}

/* ---------------------------------------------------------------------------
 * Encrypt
 * ------------------------------------------------------------------------- */

/* Which of `deviceIds` this install has no session with — the store fetches bundles
 * for exactly these before calling `encryptText`. */
export const sessionlessDevices = async (profileId, deviceIds) => {
    const missing = []
    for (const deviceId of deviceIds) {
        if (!(await loadSession(profileId, deviceId))) missing.push(deviceId)
    }
    return missing
}

/* Encrypts one message for every target device. `targets` is
 * `[{ deviceId, bundle }]` where `bundle` (the server's prekey bundle, base64
 * fields) is required only for devices `sessionlessDevices` named. Returns envelope
 * rows ready for the wire; skips a device whose bundle is missing or whose signed
 * prekey fails verification rather than failing the whole send. */
export const encryptText = async (profileId, targets, text) => {
    const device = await loadDevice(profileId)
    if (!device) throw new Error("crypto: no device — ensureDevice first")

    const plaintext = utf8(JSON.stringify({ t: text }))
    const envelopes = []

    for (const target of targets) {
        const record = await loadSession(profileId, target.deviceId)
        let session = record

        if (!session) {
            if (!target.bundle) continue
            session = startSession(device, target.bundle)
            if (!session) continue
        }

        const frame = ratchet.encrypt(session.active, plaintext)
        const body = session.pending
            ? { v: 1, prekey: session.pending, msg: frame }
            : { v: 1, msg: frame }

        envelopes.push({
            deviceId: target.deviceId,
            type: session.pending ? "PREKEY" : "RATCHET",
            body: toB64(utf8(JSON.stringify(body))),
        })

        await saveSession(profileId, target.deviceId, session)
    }

    return envelopes
}

const startSession = (device, bundle) => {
    const identity = {
        secretKey: fromB64(device.identity.secretKey),
        publicKey: fromB64(device.identity.publicKey),
    }
    let agreed
    try {
        agreed = initiate(identity, {
            identityKey: fromB64(bundle.identityKey),
            signedPreKey: {
                keyId: bundle.signedPreKeyId,
                publicKey: fromB64(bundle.signedPreKey),
                signature: fromB64(bundle.signedPreKeySignature),
            },
            oneTimePreKey: bundle.oneTimePreKey
                ? { keyId: bundle.oneTimePreKeyId, publicKey: fromB64(bundle.oneTimePreKey) }
                : undefined,
        })
    } catch {
        /* A signed prekey that does not verify is a device not to talk to, not a
         * reason the message fails for everyone else. */
        return null
    }

    return {
        active: ratchet.initAsInitiator(
            agreed.sharedKey,
            agreed.ad,
            fromB64(bundle.signedPreKey),
        ),
        archived: null,
        baseKey: null,
        pending: {
            identityKey: device.identity.publicKey,
            ephemeralKey: toB64(agreed.ephemeralKey),
            signedPreKeyId: bundle.signedPreKeyId,
            oneTimePreKeyId: bundle.oneTimePreKey ? bundle.oneTimePreKeyId : null,
            deviceId: device.id,
            registrationId: device.registrationId,
        },
    }
}

/* ---------------------------------------------------------------------------
 * Decrypt
 * ------------------------------------------------------------------------- */

const tryState = (state, frame) => {
    if (!state) return null
    const copy = structuredClone(state)
    try {
        return { plaintext: ratchet.decrypt(copy, frame), state: copy }
    } catch {
        return null
    }
}

/* Decrypts one envelope from `senderDeviceId`, returning the text or null for the
 * unreadable — which is an expected state, not an error: an envelope for a session
 * this install cannot reconstruct is precisely what the no-backup design produces,
 * and the caller renders it as such. */
export const decryptEnvelope = async (profileId, senderDeviceId, envelope) => {
    const device = await loadDevice(profileId)
    if (!device) return null

    let parsed
    try {
        parsed = JSON.parse(fromUtf8(fromB64(envelope.body)))
    } catch {
        return null
    }

    const record = (await loadSession(profileId, senderDeviceId)) ?? {
        active: null,
        archived: null,
        baseKey: null,
        pending: null,
    }

    /* Existing sessions first — newest state, then its predecessor. A duplicate
     * PREKEY frame whose handshake built the active session lands here too, via the
     * ratchet rather than a second X3DH. */
    for (const slot of ["active", "archived"]) {
        const hit = tryState(record[slot], parsed.msg)
        if (hit) {
            record[slot] = hit.state
            /* Anything of theirs decrypting proves they hold the session, so the
             * handshake no longer needs restating. */
            if (slot === "active") record.pending = null
            await saveSession(profileId, senderDeviceId, record)
            return readText(hit.plaintext)
        }
    }

    if (envelope.type !== "PREKEY" || !parsed.prekey) return null
    if (record.baseKey && record.baseKey === parsed.prekey.ephemeralKey) return null

    /* A fresh handshake. Resolve the prekeys it names to their private halves. */
    const { prekey } = parsed
    if (prekey.signedPreKeyId !== device.signedPreKey.keyId) return null

    const oneTime = prekey.oneTimePreKeyId
        ? device.oneTimePreKeys[prekey.oneTimePreKeyId]
        : null
    if (prekey.oneTimePreKeyId && !oneTime) return null

    const agreed = respond(
        {
            secretKey: fromB64(device.identity.secretKey),
            publicKey: fromB64(device.identity.publicKey),
        },
        fromB64(device.signedPreKey.secretKey),
        oneTime ? fromB64(oneTime.secretKey) : null,
        {
            identityKey: fromB64(prekey.identityKey),
            ephemeralKey: fromB64(prekey.ephemeralKey),
        },
    )

    const fresh = ratchet.initAsResponder(agreed.sharedKey, agreed.ad, {
        secretKey: fromB64(device.signedPreKey.secretKey),
        publicKey: fromB64(device.signedPreKey.publicKey),
    })

    const hit = tryState(fresh, parsed.msg)
    if (!hit) return null

    /* Only now — with the handshake proven — does the session swap in and the
     * one-time prekey burn. A garbled handshake must consume nothing. */
    if (oneTime) {
        delete device.oneTimePreKeys[prekey.oneTimePreKeyId]
        await saveDevice(profileId, device)
    }

    await saveSession(profileId, senderDeviceId, {
        active: hit.state,
        archived: record.active,
        baseKey: prekey.ephemeralKey,
        pending: record.pending,
    })

    return readText(hit.plaintext)
}

const readText = (plaintext) => {
    try {
        const { t } = JSON.parse(fromUtf8(plaintext))
        return typeof t === "string" ? t : null
    } catch {
        return null
    }
}
