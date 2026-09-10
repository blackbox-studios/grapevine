/* Exercises the crypto layer end to end, with no server and no WebView.
 *
 * Two halves. The **protocol** half runs two simulated devices through X3DH off a
 * prekey bundle and then a Double Ratchet conversation, over the cases that break
 * naive implementations — direction changes, out-of-order delivery across a DH
 * ratchet step, tampering, and a serialize/deserialize round trip mid-conversation.
 *
 * The **session** half drives `engine.js` itself, through the device store, because
 * that is where the risk actually sits: the protocol files are a transcription of a
 * published spec, while the slot logic around them (which session encrypts, which one
 * still decrypts, when a one-time prekey is spent) was written here. `crypto-testenv`
 * is what lets it run outside a bundler.
 *
 *   node scripts/crypto-selftest.mjs
 *
 * Run it after any change under src/lib/crypto/. It exits non-zero on the first
 * failure.
 */

import {
    fromB64,
    fromUtf8,
    generateIdentity,
    generateKeyPair,
    sign,
    toB64,
    utf8,
} from "../src/lib/crypto/primitives.js"
import * as ratchet from "../src/lib/crypto/ratchet.js"
import { initiate, respond } from "../src/lib/crypto/x3dh.js"

let failures = 0
const check = (label, ok) => {
    console.log(`${ok ? "  ok " : "FAIL "} ${label}`)
    if (!ok) failures += 1
}

/* ── Fixture: Bob publishes a bundle, Alice initiates ─────────────────────── */

const alice = { identity: generateIdentity() }
const bob = {
    identity: generateIdentity(),
    signedPreKey: generateKeyPair(),
    oneTimePreKey: generateKeyPair(),
}

const bundle = {
    identityKey: bob.identity.publicKey,
    signedPreKey: {
        keyId: 1,
        publicKey: bob.signedPreKey.publicKey,
        signature: sign(bob.identity.secretKey, bob.signedPreKey.publicKey),
    },
    oneTimePreKey: { keyId: 7, publicKey: bob.oneTimePreKey.publicKey },
}

/* ── X3DH ─────────────────────────────────────────────────────────────────── */

const aliceX = initiate(alice.identity, bundle)
const bobX = respond(
    bob.identity,
    bob.signedPreKey.secretKey,
    bob.oneTimePreKey.secretKey,
    { identityKey: alice.identity.publicKey, ephemeralKey: aliceX.ephemeralKey },
)

check("x3dh: both sides derive the same shared key", toB64(aliceX.sharedKey) === toB64(bobX.sharedKey))
check("x3dh: both sides derive the same AD", toB64(aliceX.ad) === toB64(bobX.ad))

const forged = {
    ...bundle,
    signedPreKey: { ...bundle.signedPreKey, publicKey: generateKeyPair().publicKey },
}
let rejected = false
try {
    initiate(alice.identity, forged)
} catch {
    rejected = true
}
check("x3dh: substituted signed prekey is rejected", rejected)

/* ── Double Ratchet ───────────────────────────────────────────────────────── */

let a = ratchet.initAsInitiator(aliceX.sharedKey, aliceX.ad, bob.signedPreKey.publicKey)
let b = ratchet.initAsResponder(bobX.sharedKey, bobX.ad, bob.signedPreKey)

const send = (state, text) => ratchet.encrypt(state, utf8(text))
const recv = (state, message) => fromUtf8(ratchet.decrypt(state, message))

check("first message decrypts", recv(b, send(a, "Christ is risen!")) === "Christ is risen!")
check("reply decrypts (direction change)", recv(a, send(b, "Truly He is risen!")) === "Truly He is risen!")

/* Out of order inside one chain. */
const m1 = send(a, "one")
const m2 = send(a, "two")
const m3 = send(a, "three")
check("out of order: newest first", recv(b, m3) === "three")
check("out of order: banked key one", recv(b, m1) === "one")
check("out of order: banked key two", recv(b, m2) === "two")

/* A message delayed across a DH ratchet step. */
const delayed = send(a, "delayed")
check("interleaved reply", recv(a, send(b, "ping")) === "ping")
check("message after the step", recv(b, send(a, "current")) === "current")
check("delayed message from the previous chain", recv(b, delayed) === "delayed")

/* Long ping-pong: 40 direction changes. */
let pingPong = true
for (let i = 0; i < 40; i++) {
    if (recv(b, send(a, `a${i}`)) !== `a${i}`) pingPong = false
    if (recv(a, send(b, `b${i}`)) !== `b${i}`) pingPong = false
}
check("40 rounds of ping-pong", pingPong)

/* Persistence: both states survive JSON. */
a = JSON.parse(JSON.stringify(a))
b = JSON.parse(JSON.stringify(b))
check("states survive serialization", recv(b, send(a, "after reload")) === "after reload")

/* Tampering fails closed. */
const genuine = send(a, "genuine")
const bytes = fromB64(genuine.ciphertext)
bytes[0] ^= 0xff
let tamperRejected = false
try {
    recv(b, { ...genuine, ciphertext: toB64(bytes) })
} catch {
    tamperRejected = true
}
check("tampered ciphertext is rejected", tamperRejected)

/* ── No one-time prekey (pool ran dry) ────────────────────────────────────── */

const aliceX2 = initiate(alice.identity, { ...bundle, oneTimePreKey: undefined })
const bobX2 = respond(bob.identity, bob.signedPreKey.secretKey, null, {
    identityKey: alice.identity.publicKey,
    ephemeralKey: aliceX2.ephemeralKey,
})
check("x3dh without a one-time prekey still agrees", toB64(aliceX2.sharedKey) === toB64(bobX2.sharedKey))

/* ── The session layer ────────────────────────────────────────────────────
 *
 * Imported dynamically: the resolver has to be registered before anything under
 * `engine.js` is loaded, and a static import would hoist above that call. */

const { installResolver, installStorage } = await import("./crypto-testenv.mjs")
installResolver()
installStorage()

const engine = await import("../src/lib/crypto/engine.js")

/* Two profiles in one process are two devices: the store namespaces every key by
 * profile id, which is the same property that keeps two accounts in one browser from
 * reading each other's sessions. */
const ANNA = "11111111-1111-4111-8111-111111111111"
const PETER = "22222222-2222-4222-8222-222222222222"

const annaDevice = await engine.ensureDevice(ANNA)
const peterDevice = await engine.ensureDevice(PETER)

check("ensureDevice mints a device", Boolean(annaDevice.deviceId))
check(
    "ensureDevice is idempotent",
    (await engine.ensureDevice(ANNA)).deviceId === annaDevice.deviceId,
)
check(
    "two profiles get two identities",
    annaDevice.registration.identityKey !== peterDevice.registration.identityKey,
)

/* A bundle as `bundlesFor` would serve it: the registration's public material, with
 * one one-time prekey popped off the pool. */
const bundleFrom = (registration, index = 0) => ({
    deviceId: registration.deviceId,
    registrationId: registration.registrationId,
    identityKey: registration.identityKey,
    signedPreKeyId: registration.signedPreKeyId,
    signedPreKey: registration.signedPreKey,
    signedPreKeySignature: registration.signedPreKeySignature,
    oneTimePreKeyId: registration.oneTimePreKeys[index]?.keyId ?? null,
    oneTimePreKey: registration.oneTimePreKeys[index]?.key ?? null,
})

check(
    "sessionlessDevices names a device with no session",
    (await engine.sessionlessDevices(ANNA, [peterDevice.deviceId])).length === 1,
)

const [envelope] = await engine.encryptText(
    ANNA,
    [{ deviceId: peterDevice.deviceId, bundle: bundleFrom(peterDevice.registration) }],
    "Christ is risen",
)
check("first send produces a PREKEY envelope", envelope?.type === "PREKEY")
check(
    "the session is remembered, so the next send needs no bundle",
    (await engine.sessionlessDevices(ANNA, [peterDevice.deviceId])).length === 0,
)

check(
    "the recipient decrypts it",
    (await engine.decryptEnvelope(PETER, annaDevice.deviceId, envelope)) === "Christ is risen",
)

/* **A ratchet key works once.** Re-presenting a delivered envelope must not decrypt
 * a second time; if it does, the skipped-key ledger is banking keys it should have
 * burned and a replayed envelope reads as a fresh message. */
check(
    "a replayed envelope does not decrypt twice",
    (await engine.decryptEnvelope(PETER, annaDevice.deviceId, envelope)) === null,
)

/* The reply rides the session Peter established while decrypting, so it needs no
 * bundle of its own and must not be a PREKEY envelope. */
const [reply] = await engine.encryptText(
    PETER,
    [{ deviceId: annaDevice.deviceId }],
    "Truly He is risen",
)
check("the reply is a RATCHET envelope", reply?.type === "RATCHET")
check(
    "the opener decrypts the reply",
    (await engine.decryptEnvelope(ANNA, peterDevice.deviceId, reply)) === "Truly He is risen",
)

/* A target whose bundle never arrived is skipped, not thrown on — one unreachable
 * device must not take the whole send down with it. */
const partial = await engine.encryptText(
    ANNA,
    [
        { deviceId: peterDevice.deviceId },
        { deviceId: "33333333-3333-4333-8333-333333333333" },
    ],
    "For the parish council",
)
check("a device with no session and no bundle is skipped", partial.length === 1)

/* Garbage from the wire is a null, not an exception: the store renders an
 * undecryptable row rather than failing the whole page of messages. */
check(
    "a corrupt envelope decrypts to null",
    (await engine.decryptEnvelope(PETER, annaDevice.deviceId, { type: "RATCHET", body: "bm90LWpzb24=" })) === null,
)

check("topUpPreKeys does nothing while the pool is deep", (await engine.topUpPreKeys(ANNA, 100)) === null)
check("topUpPreKeys refills a drained pool", Boolean(await engine.topUpPreKeys(ANNA, 0)))

if (failures > 0) {
    console.error(`\n${failures} check(s) failed`)
    process.exit(1)
}
console.log("\nAll checks passed.")
