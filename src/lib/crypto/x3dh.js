import {
    concat,
    dh,
    generateKeyPair,
    hkdfBytes,
    identityDhPublic,
    identityDhSecret,
    verify,
} from "./primitives.js"

/* X3DH key agreement, from signal.org/docs/specifications/x3dh.
 *
 * What it buys: two devices that have never been online at the same time end up
 * sharing a secret, because the responder parked its half of the handshake on the
 * server in advance (the prekey bundle) and the initiator completes it alone. The
 * first envelope then carries the initiator's half (`PREKEY` type), so the responder
 * can run `respond` on receipt and both sides arrive at the same key with zero round
 * trips between them.
 *
 * The four DH steps (§3.3) each defeat a different impersonation: DH1 binds the
 * initiator's identity, DH2 the responder's, DH3 makes the session fresh, and DH4 —
 * present only when a one-time prekey was available — gives the very first message
 * forward secrecy against the responder's long-term keys later leaking. Their
 * concatenation is prefixed with 32 0xFF bytes (§2.2's F for curve25519, which
 * domain-separates the KDF input from any signature over the same values) and run
 * through HKDF.
 *
 * `ad` is the pair of identity keys (§3.3), fed into every subsequent AEAD so a
 * ciphertext cannot be replayed into a session between different parties. */

const F = new Uint8Array(32).fill(0xff)

const deriveSecret = (dhs) =>
    hkdfBytes(concat(F, ...dhs), new Uint8Array(32), "GrapevineX3DH", 32)

/* The initiator's side, run against a bundle fetched from the server:
 * `{ identityKey, signedPreKey: { keyId, publicKey, signature }, oneTimePreKey? }`,
 * every key a Uint8Array. Throws if the signed prekey's signature does not verify
 * under the bundle's identity key — the one check that stops a server (ours or a
 * compromise of it) substituting keys it holds the private halves of. */
export const initiate = (identity, bundle) => {
    const { identityKey, signedPreKey, oneTimePreKey } = bundle

    if (!verify(identityKey, signedPreKey.publicKey, signedPreKey.signature)) {
        throw new Error("x3dh: signed prekey signature does not verify")
    }

    const ephemeral = generateKeyPair()
    const ourDhSecret = identityDhSecret(identity.secretKey)
    const theirDhPublic = identityDhPublic(identityKey)

    const dhs = [
        dh(ourDhSecret, signedPreKey.publicKey),
        dh(ephemeral.secretKey, theirDhPublic),
        dh(ephemeral.secretKey, signedPreKey.publicKey),
    ]
    if (oneTimePreKey) dhs.push(dh(ephemeral.secretKey, oneTimePreKey.publicKey))

    return {
        sharedKey: deriveSecret(dhs),
        ad: concat(identity.publicKey, identityKey),
        ephemeralKey: ephemeral.publicKey,
    }
}

/* The responder's side, run on the first envelope's header: the initiator's identity
 * and ephemeral publics plus which of our prekeys they used (resolved to private keys
 * by the caller, since only the device store knows them). Mirrors `initiate` exactly —
 * same DHs with the roles of secret and public swapped, same AD order, initiator
 * first. */
export const respond = (identity, signedPreKeySecret, oneTimePreKeySecret, header) => {
    const ourDhSecret = identityDhSecret(identity.secretKey)
    const theirDhPublic = identityDhPublic(header.identityKey)

    const dhs = [
        dh(signedPreKeySecret, theirDhPublic),
        dh(ourDhSecret, header.ephemeralKey),
        dh(signedPreKeySecret, header.ephemeralKey),
    ]
    if (oneTimePreKeySecret) dhs.push(dh(oneTimePreKeySecret, header.ephemeralKey))

    return {
        sharedKey: deriveSecret(dhs),
        ad: concat(header.identityKey, identity.publicKey),
    }
}
