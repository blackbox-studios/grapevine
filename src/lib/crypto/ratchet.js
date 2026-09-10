import {
    aeadDecrypt,
    aeadEncrypt,
    concat,
    dh,
    fromB64,
    generateKeyPair,
    kdfChainKey,
    kdfRootKey,
    toB64,
    utf8,
} from "./primitives.js"

/* The Double Ratchet, from signal.org/docs/specifications/doubleratchet — the state
 * machine of §3.6 with the header-handling of §3.5, written as pure functions over a
 * serializable state object so `engine.js` can persist a session between app launches.
 *
 * The property it buys, in one sentence: every message is encrypted under a key used
 * exactly once and then deleted, derived down a chain that steps forward with each
 * message (forward secrecy — stealing the phone tomorrow reads nothing from today) and
 * is replaced wholesale by a fresh DH exchange every time the conversation changes
 * direction (self-healing — even a leaked chain key stops working one round trip
 * later).
 *
 * Deviations from the document, both declared in it as choices left to the
 * implementation:
 *
 *  - The header is JSON `{ dh, pn, n }` (base64, ints) rather than protobuf, because
 *    this codebase has no protobuf anywhere and the spec (§3.6, HEADER) prescribes
 *    only the fields. It is authenticated identically: the AEAD's associated data is
 *    AD || header bytes, so a tampered header fails the MAC before anything is
 *    decrypted.
 *  - Headers are not themselves encrypted (§4's optional variant). They contain
 *    ratchet publics and counters, never content; the transport around them is TLS to
 *    our own API.
 *
 * MAX_SKIP (§3.6): the ceiling on message keys stored for out-of-order delivery, and
 * the guard that stops a corrupt header claiming n = 10^9 and asking this device to
 * derive its way there. */

const MAX_SKIP = 512

/* Skipped message keys ride inside the state as `{ "<dhPub b64>.<n>": <mk b64> }` so
 * they serialize with it — a bounded map, oldest evicted first (§3.6 note on deletion:
 * a key that has waited out `MAX_SKIP` newer arrivals is not late, it is lost). */
const skipKey = (dhPub, n) => `${dhPub}.${n}`

const rememberSkipped = (state, dhPub, n, messageKey) => {
    state.skipped[skipKey(dhPub, n)] = toB64(messageKey)
    const keys = Object.keys(state.skipped)
    if (keys.length > MAX_SKIP) delete state.skipped[keys[0]]
}

/* ---------------------------------------------------------------------------
 * Initialization (§3.6 RatchetInitAlice / RatchetInitBob)
 *
 * The initiator seeds DHr with the responder's signed prekey and ratchets
 * immediately; the responder seeds DHs with that prekey's own pair and waits for
 * the first header to drive its first DH step. X3DH's output is the root key and
 * its AD threads through every AEAD call for the session's life.
 * ------------------------------------------------------------------------- */

export const initAsInitiator = (sharedKey, ad, theirSignedPreKeyPublic) => {
    const ratchetKey = generateKeyPair()
    const { rootKey, chainKey } = kdfRootKey(
        sharedKey,
        dh(ratchetKey.secretKey, theirSignedPreKeyPublic),
    )
    return {
        ad: toB64(ad),
        dhsSecret: toB64(ratchetKey.secretKey),
        dhsPublic: toB64(ratchetKey.publicKey),
        dhr: toB64(theirSignedPreKeyPublic),
        rootKey: toB64(rootKey),
        sendChain: toB64(chainKey),
        recvChain: null,
        ns: 0,
        nr: 0,
        pn: 0,
        skipped: {},
    }
}

export const initAsResponder = (sharedKey, ad, ourSignedPreKeyPair) => ({
    ad: toB64(ad),
    dhsSecret: toB64(ourSignedPreKeyPair.secretKey),
    dhsPublic: toB64(ourSignedPreKeyPair.publicKey),
    dhr: null,
    rootKey: toB64(sharedKey),
    sendChain: null,
    recvChain: null,
    ns: 0,
    nr: 0,
    pn: 0,
    skipped: {},
})

/* ---------------------------------------------------------------------------
 * Encrypt (§3.6 RatchetEncrypt)
 * ------------------------------------------------------------------------- */

const headerBytes = (header) => utf8(JSON.stringify(header))

export const encrypt = (state, plaintext) => {
    const { messageKey, chainKey } = kdfChainKey(fromB64(state.sendChain))
    state.sendChain = toB64(chainKey)

    const header = { dh: state.dhsPublic, pn: state.pn, n: state.ns }
    state.ns += 1

    const { ciphertext, mac } = aeadEncrypt(
        messageKey,
        plaintext,
        concat(fromB64(state.ad), headerBytes(header)),
    )

    return { header, ciphertext: toB64(ciphertext), mac: toB64(mac) }
}

/* ---------------------------------------------------------------------------
 * Decrypt (§3.6 RatchetDecrypt + SkipMessageKeys + DHRatchet)
 * ------------------------------------------------------------------------- */

const trySkipped = (state, message) => {
    const key = skipKey(message.header.dh, message.header.n)
    const stored = state.skipped[key]
    if (!stored) return null

    const plaintext = aeadDecrypt(
        fromB64(stored),
        fromB64(message.ciphertext),
        fromB64(message.mac),
        concat(fromB64(state.ad), headerBytes(message.header)),
    )
    if (plaintext) delete state.skipped[key]
    return plaintext
}

/* Walks the receive chain up to (not including) `until`, banking each key for the
 * out-of-order message it belongs to. */
const skipTo = (state, until) => {
    if (state.recvChain === null) return
    if (until - state.nr > MAX_SKIP) throw new Error("ratchet: too many skipped messages")

    let chain = fromB64(state.recvChain)
    while (state.nr < until) {
        const { messageKey, chainKey } = kdfChainKey(chain)
        rememberSkipped(state, state.dhr, state.nr, messageKey)
        chain = chainKey
        state.nr += 1
    }
    state.recvChain = toB64(chain)
}

/* A new ratchet public in the header: finish their previous chain, then two root-key
 * steps — one deriving our new receive chain from their key, one deriving a fresh send
 * chain from a keypair we mint on the spot. */
const dhRatchet = (state, header) => {
    state.pn = state.ns
    state.ns = 0
    state.nr = 0
    state.dhr = header.dh

    let step = kdfRootKey(
        fromB64(state.rootKey),
        dh(fromB64(state.dhsSecret), fromB64(state.dhr)),
    )
    state.recvChain = toB64(step.chainKey)

    const next = generateKeyPair()
    state.dhsSecret = toB64(next.secretKey)
    state.dhsPublic = toB64(next.publicKey)

    step = kdfRootKey(fromB64(step.rootKey), dh(next.secretKey, fromB64(state.dhr)))
    state.rootKey = toB64(step.rootKey)
    state.sendChain = toB64(step.chainKey)
}

/* Decrypts in place: `state` is mutated to its post-message form on success and must
 * then be persisted by the caller; on failure it throws having already mutated, so the
 * caller must decrypt against a *copy* if it intends to retry another way. Returns the
 * plaintext bytes. */
export const decrypt = (state, message) => {
    const banked = trySkipped(state, message)
    if (banked) return banked

    if (message.header.dh !== state.dhr) {
        skipTo(state, message.header.pn)
        dhRatchet(state, message.header)
    }
    skipTo(state, message.header.n)

    const { messageKey, chainKey } = kdfChainKey(fromB64(state.recvChain))
    state.recvChain = toB64(chainKey)
    state.nr += 1

    const plaintext = aeadDecrypt(
        messageKey,
        fromB64(message.ciphertext),
        fromB64(message.mac),
        concat(fromB64(state.ad), headerBytes(message.header)),
    )
    if (!plaintext) throw new Error("ratchet: message failed authentication")
    return plaintext
}
