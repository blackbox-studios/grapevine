/* Exercises the protocol layer end to end, with no server and no WebView: two
 * simulated devices run X3DH off a prekey bundle and then a Double Ratchet
 * conversation through the cases that break naive implementations — direction
 * changes, out-of-order delivery across a DH ratchet step, tampering, and a
 * serialize/deserialize round trip mid-conversation.
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

if (failures > 0) {
    console.error(`\n${failures} check(s) failed`)
    process.exit(1)
}
console.log("\nAll checks passed.")
