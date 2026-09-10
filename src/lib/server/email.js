import "server-only"

/* The email transport: how the one letter this app sends leaves the building.
 *
 * This file knows nothing about parishes or invitations. It takes an address, a subject and a
 * body and hands them to Resend. What the letter says lives in `invites.js`, which is the only
 * caller — the same split as `push.js` and `notifications.service.js`.
 *
 * ── Why Resend's HTTP API and not a mailer ──────────────────────────────────
 *
 * Supabase already sends this project's sign-in codes over Resend, so the domain is verified
 * and the credential exists. What Supabase cannot send is a letter of our own: its templates
 * are bound to its own auth events. That leaves one POST, which is the same argument
 * `push.js` makes about `firebase-admin` — nodemailer plus an SMTP dialogue is a dependency
 * and a connection lifecycle to own for something `fetch` does in ten lines.
 *
 * ── Sends are queued, one at a time ────────────────────────────────────────
 *
 * Resend rate-limits on requests per second, and its caller works through a batch. So sends go
 * through a single-file queue with a gap between them, which costs nothing that matters:
 * nobody is waiting on a letter, and the sweep that drives this is already detached from the
 * request it rode in on. */

const API_KEY = process.env.RESEND_API_KEY
/* Must be an address on a domain verified in Resend, or every send is rejected. */
const FROM = process.env.EMAIL_FROM || "Grapevine <no-reply@throughgrapevine.com>"

const ENDPOINT = "https://api.resend.com/emails"

/* Whether email is wired up at all. False in local development and on any deploy that has not
 * been given the key, and `sendEmail` turns into a no-op — an admission still succeeds, the
 * membership is still written, and only the letter is missing. Telling somebody is out of band
 * for a parish anyway, which is what makes that an acceptable degradation rather than a
 * half-finished invite. */
export const emailConfigured = () => Boolean(API_KEY)

/* Roughly two requests a second, which is Resend's published limit. */
const GAP_MS = 600

let tail = Promise.resolve()

const post = async ({ to, subject, text, html }) => {
    const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
    })

    if (!res.ok) {
        throw new Error(`Resend refused the message (${res.status}): ${await res.text()}`)
    }
}

/* Queues one message and resolves with **whether it went**.
 *
 * **Never rejects**, and the two halves of that are deliberate. A refusal must not take the
 * rest of the batch down with it, which is why the failure is caught inside the chain rather
 * than propagated along it. And it must not be *silent* either, which is why the answer comes
 * back as a boolean: the caller records a send only when one happened, so a letter Resend
 * refused stays owed and is tried again rather than being marked delivered and forgotten.
 *
 * `false` is also what an unconfigured deploy gets, which is the honest answer — no letter
 * went — and it leaves the row queued for whenever a key is set. */
export const sendEmail = ({ to, subject, text, html }) => {
    if (!emailConfigured()) return Promise.resolve(false)

    const queued = tail.then(async () => {
        let sent = false
        try {
            await post({ to, subject, text, html })
            sent = true
        } catch (error) {
            console.error(`[email] could not send to ${to}`, error)
        }
        await new Promise((resolve) => setTimeout(resolve, GAP_MS))
        return sent
    })

    /* The chain carries the *gap*, not the verdict, so a caller awaiting its own send does not
     * hold up the queue behind it and cannot see somebody else's result. */
    tail = queued.then(() => {})
    return queued
}
