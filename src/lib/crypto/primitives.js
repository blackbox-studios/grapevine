import { cbc } from "@noble/ciphers/aes.js"
import { ed25519, x25519 } from "@noble/curves/ed25519.js"
import { hkdf } from "@noble/hashes/hkdf.js"
import { hmac } from "@noble/hashes/hmac.js"
import { sha256 } from "@noble/hashes/sha2.js"

/* The cryptographic floor of the messaging feature: key generation, Diffie-Hellman,
 * signing, the KDFs and the AEAD that `x3dh.js` and `ratchet.js` are written against.
 * Everything here is a thin naming layer over audited primitives (@noble/curves,
 * @noble/hashes, @noble/ciphers) — this file contains no cryptographic construction of
 * its own, and nothing in it may keep state.
 *
 * ── Why the identity key is Ed25519 rather than X25519 ───────────────────────
 *
 * The Signal protocol needs the identity key to do two jobs: Diffie-Hellman in X3DH and
 * signing the prekeys. Signal's own implementation holds a Curve25519 (Montgomery) key
 * and signs with XEdDSA, a signature scheme published alongside X3DH precisely so one
 * key can do both. Implementing XEdDSA is more novel cryptography than this app should
 * carry, and the specs themselves point at the alternative (X3DH §2.2): hold the master
 * key in *Edwards* form, sign with standard Ed25519, and derive the Montgomery form for
 * DH through the birational map between the two curves — which is a supported one-liner
 * in @noble/curves (`toMontgomery` / `toMontgomerySecret`). Same key, both jobs, no
 * hand-rolled signatures.
 *
 * ── The AEAD (Double Ratchet §3.1, "recommended" construction) ───────────────
 *
 * ENCRYPT(mk, plaintext, ad) is the spec's own recipe: HKDF-SHA256 expands the message
 * key into an AES-256 key, an HMAC-SHA256 key and an IV; the plaintext is AES-256-CBC
 * encrypted (PKCS7); the MAC covers ad || ciphertext and is verified before a single
 * byte is decrypted. AES-GCM would be one call, but the spec's construction is kept
 * exactly because "don't improvise" is the standing instruction on this feature — and
 * CBC+HMAC has no nonce-reuse cliff for a bug to fall off. */

/* ---------------------------------------------------------------------------
 * Bytes
 * ------------------------------------------------------------------------- */

export const utf8 = (text) => new TextEncoder().encode(text)
export const fromUtf8 = (bytes) => new TextDecoder().decode(bytes)

/* Runs in the WebView and in the Node self-test script, so it cannot assume either
 * `Buffer` or `atob`. */
export const toB64 = (bytes) => {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64")
    let bin = ""
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
}

export const fromB64 = (text) => {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(text, "base64"))
    const bin = atob(text)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
}

export const concat = (...arrays) => {
    const total = arrays.reduce((n, a) => n + a.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const a of arrays) {
        out.set(a, offset)
        offset += a.length
    }
    return out
}

export const randomBytes = (length) =>
    globalThis.crypto.getRandomValues(new Uint8Array(length))

/* Byte-wise constant-time equality, for MAC checks. */
export const bytesEqual = (a, b) => {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
    return diff === 0
}

/* ---------------------------------------------------------------------------
 * Keys
 * ------------------------------------------------------------------------- */

/* The Ed25519 master keypair one installation identifies itself with. */
export const generateIdentity = () => {
    const secretKey = ed25519.utils.randomSecretKey()
    return { secretKey, publicKey: ed25519.getPublicKey(secretKey) }
}

/* An X25519 keypair — ephemeral keys, prekeys, and ratchet keys are all this shape. */
export const generateKeyPair = () => {
    const secretKey = x25519.utils.randomSecretKey()
    return { secretKey, publicKey: x25519.getPublicKey(secretKey) }
}

/* The identity key's Montgomery form, for the X3DH DH steps. See the header. */
export const identityDhPublic = (edPublicKey) => ed25519.utils.toMontgomery(edPublicKey)
export const identityDhSecret = (edSecretKey) => ed25519.utils.toMontgomerySecret(edSecretKey)

export const dh = (secretKey, publicKey) => x25519.getSharedSecret(secretKey, publicKey)

export const sign = (edSecretKey, message) => ed25519.sign(message, edSecretKey)
export const verify = (edPublicKey, message, signature) => {
    try {
        return ed25519.verify(signature, message, edPublicKey)
    } catch {
        return false
    }
}

/* ---------------------------------------------------------------------------
 * KDFs (Double Ratchet §3.2, §5.2)
 * ------------------------------------------------------------------------- */

export const hkdfBytes = (ikm, salt, info, length) =>
    hkdf(sha256, ikm, salt, utf8(info), length)

/* KDF_RK: one HKDF invocation yielding the next root key and a chain key. */
export const kdfRootKey = (rootKey, dhOutput) => {
    const okm = hkdfBytes(dhOutput, rootKey, "GrapevineRatchet", 64)
    return { rootKey: okm.slice(0, 32), chainKey: okm.slice(32, 64) }
}

/* KDF_CK: the spec's constant-byte HMACs — 0x01 mints the message key, 0x02 steps the
 * chain. */
export const kdfChainKey = (chainKey) => ({
    messageKey: hmac(sha256, chainKey, new Uint8Array([0x01])),
    chainKey: hmac(sha256, chainKey, new Uint8Array([0x02])),
})

/* ---------------------------------------------------------------------------
 * AEAD (Double Ratchet §3.1) — see the header for the construction.
 * ------------------------------------------------------------------------- */

const messageKeys = (messageKey) => {
    const okm = hkdfBytes(messageKey, new Uint8Array(32), "GrapevineMessage", 80)
    return { encKey: okm.slice(0, 32), macKey: okm.slice(32, 64), iv: okm.slice(64, 80) }
}

export const aeadEncrypt = (messageKey, plaintext, ad) => {
    const { encKey, macKey, iv } = messageKeys(messageKey)
    const ciphertext = cbc(encKey, iv).encrypt(plaintext)
    const mac = hmac(sha256, macKey, concat(ad, ciphertext))
    return { ciphertext, mac }
}

/* Returns null rather than throwing on a bad MAC — a caller is always in a "try this
 * session, then that one" loop, and authenticity failure is an expected branch there,
 * not an exception. */
export const aeadDecrypt = (messageKey, ciphertext, mac, ad) => {
    const { encKey, macKey, iv } = messageKeys(messageKey)
    const expected = hmac(sha256, macKey, concat(ad, ciphertext))
    if (!bytesEqual(expected, mac)) return null
    try {
        return cbc(encKey, iv).decrypt(ciphertext)
    } catch {
        return null
    }
}
