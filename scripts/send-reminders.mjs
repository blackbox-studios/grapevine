/* Send every sign-up reminder that has come due.
 *
 *   npm run signups:remind                       # against the local dev server
 *   npm run signups:remind -- --url https://…    # against a deployment
 *
 * ── What this is, and what it is not ────────────────────────────────────────
 *
 * It is a **dozen lines that make one HTTP request**, and that is deliberate. Every other
 * script in this directory talks to the database directly, which is right when the work is a
 * database write — `grant-owner`, `erase-account` and the seeds all do. Sending a reminder is
 * not only a database write: it writes a `Notification` row and then pushes to Firebase, and
 * both of those live under `src/lib/server/**`, every file of which begins with
 * `import "server-only"` — a specifier Next provides to its own bundler and that a plain Node
 * process cannot resolve at all.
 *
 * So a script that did the work itself would have to carry a second copy of the notification
 * write and a second copy of the FCM transport. The logic stays in `sendDueReminders`, where
 * the rest of the app's notifications are written, and this reaches it over HTTP.
 *
 * ── Running it on a schedule ────────────────────────────────────────────────
 *
 * Every fifteen minutes is plenty: a reminder is a week or a day out, so a quarter of an hour
 * either side is invisible, and the endpoint is idempotent — it claims the rows it is about to
 * send before it sends them, so two overlapping runs cannot double-nudge anybody.
 *
 *   # crontab, on the host running `next start`
 *   *\/15 * * * * curl -fsS -X POST -H "Authorization: Bearer $REMINDERS_SECRET" \
 *       https://throughgrapevine.com/api/signups/reminders
 *
 * A missed window costs nothing and is not made up for: `sendDueReminders` retires anything
 * more than six hours overdue instead of delivering it, because a nudge about a shift that
 * started this morning is not a reminder.
 *
 * ── The secret ──────────────────────────────────────────────────────────────
 *
 * `REMINDERS_SECRET` has to match the one the server was started with, and the endpoint 404s
 * when the server has none — which is every deploy that has not set a schedule up. Generate
 * one with `openssl rand -hex 32`.
 */

import "dotenv/config"

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
    const at = args.indexOf(`--${name}`)
    return at === -1 ? fallback : (args[at + 1] ?? fallback)
}

const base = (
    flag("url") ??
    process.env.REMINDERS_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:3000/api"
).replace(/\/$/, "")

const secret = process.env.REMINDERS_SECRET?.trim()

if (!secret) {
    console.error(
        "REMINDERS_SECRET is not set.\n" +
        "Set the same value here and on the server, then try again:\n" +
        "  REMINDERS_SECRET=$(openssl rand -hex 32)",
    )
    process.exit(1)
}

const url = `${base}/signups/reminders`

let response
try {
    response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
    })
} catch (error) {
    console.error(`Could not reach ${url}\n  ${error.message}`)
    process.exit(1)
}

if (response.status === 404) {
    console.error(
        `${url} answered 404.\n` +
        "That is what the endpoint does when the *server* has no REMINDERS_SECRET set — check\n" +
        "the environment `next start` was launched with, not this one.",
    )
    process.exit(1)
}

if (!response.ok) {
    const body = await response.text().catch(() => "")
    console.error(`${url} answered ${response.status}\n${body}`)
    process.exit(1)
}

const { sent } = await response.json()
console.log(sent === 0 ? "Nothing due." : `Sent ${sent} reminder${sent === 1 ? "" : "s"}.`)
