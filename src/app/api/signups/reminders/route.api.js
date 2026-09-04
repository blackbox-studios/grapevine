import { timingSafeEqual } from "node:crypto"

import { preflight, route } from "@/lib/server/handler"
import { notFound, unauthenticated } from "@/lib/server/errors"
import { sendResource } from "@/lib/server/respond"
import { sendDueReminders } from "@/lib/server/signups.service"

/* POST /api/signups/reminders — send every sign-up reminder that has come due.
 *
 * ── Why this is an endpoint and not a script ─────────────────────────────────
 *
 * Every other out-of-band job in this repo is a script on a trusted machine (`npm run owner`,
 * `npm run erase`), and that is the right shape when the work is a database write. This one
 * cannot be: sending a reminder writes a `Notification` **and** pushes to FCM, and all of that
 * lives under `src/lib/server/**`, which begins with `import "server-only"` — a module
 * specifier Next provides to its own bundler and that a plain Node process cannot resolve at
 * all. A script would therefore have to reimplement the notification write and the FCM
 * transport, which is two copies of the one thing in this app that must not have two.
 *
 * So the logic stays in the service where it belongs and the schedule reaches it over HTTP.
 * `scripts/send-reminders.mjs` (`npm run signups:remind`) is a dozen lines that POST here.
 *
 * ── The exception it makes, and the two properties that bound it ─────────────
 *
 * Every other endpoint in this app begins with `requireViewer` and there is no anonymous read
 * anywhere. This one has no viewer, because a clock is not a person. It is a **bounded**
 * exception, in the same shape as `POST /api/auth/review`, and it holds only because of two
 * things:
 *
 *   1. **It is off unless deliberately turned on.** With `REMINDERS_SECRET` unset it answers
 *      404 — not 401, which would confirm the endpoint exists — and that is the state of every
 *      deploy that has not set up a schedule.
 *   2. **It reads nothing and returns nothing.** No viewer's data crosses it in either
 *      direction; the response is a count. The worst an attacker with the secret can do is
 *      cause reminders that were already due to be delivered slightly earlier, which is what
 *      the endpoint is for.
 *
 * The comparison is `timingSafeEqual`, like the review endpoint's, so the secret cannot be
 * recovered a byte at a time. Widening either property turns this into the back door that
 * `dev-login.mjs`'s header refuses to be. */
export const dynamic = "force-dynamic"

const secret = () => process.env.REMINDERS_SECRET?.trim() || null

/* Constant-time, and length-safe: `timingSafeEqual` throws on a length mismatch, which would
 * itself be a timing signal, so the lengths are compared first and the buffers only when they
 * agree. */
const matches = (offered, expected) => {
    const a = Buffer.from(String(offered ?? ""), "utf8")
    const b = Buffer.from(expected, "utf8")
    return a.length === b.length && timingSafeEqual(a, b)
}

export const POST = route(async (request) => {
    const expected = secret()
    /* Not configured is not an error, it is the ordinary state — so this endpoint does not
     * exist rather than refusing. */
    if (!expected) throw notFound("Not found.")

    const header = request.headers.get("authorization") ?? ""
    const [scheme, token] = header.split(" ")
    if (!/^bearer$/i.test(scheme ?? "") || !matches(token, expected)) {
        throw unauthenticated("Not authorized.")
    }

    const result = await sendDueReminders()
    return sendResource(result)
})

export const OPTIONS = preflight
