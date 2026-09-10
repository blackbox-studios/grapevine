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
 * Resend rate-limits on requests per second, and the caller admits people in a batch: a priest
 * pasting in forty addresses fires forty detached sends within a few milliseconds, and most of
 * them come back 429. So they go through a single-file queue with a gap between them, which
 * costs nothing that matters — nobody is waiting on this, and every entry point is
 * fire-and-forget after a committed write. */

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

/* Queues one message. Resolves when it has been sent, or when it has failed and been logged.
 *
 * **Never rejects.** Every caller is a fire-and-forget after a committed write, so there is
 * nothing for them to catch and nothing they could do about a mail provider having a bad
 * minute. A swallowed failure also has to stay out of the chain below, or one refused address
 * would take the rest of the batch with it. */
export const sendEmail = ({ to, subject, text, html }) => {
    if (!emailConfigured()) return Promise.resolve()

    tail = tail.then(async () => {
        try {
            await post({ to, subject, text, html })
        } catch (error) {
            console.error(`[email] could not send to ${to}`, error)
        }
        await new Promise((resolve) => setTimeout(resolve, GAP_MS))
    })

    return tail
}
