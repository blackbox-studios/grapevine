import "server-only"

import { SignJWT, importPKCS8 } from "jose"

/* The FCM transport: how a notification row becomes a buzz in somebody's pocket.
 *
 * This file knows nothing about parishes, likes or posts. It takes tokens and a payload and
 * reports which tokens FCM has stopped recognising. Everything domain-shaped lives in
 * `notifications.service.js`, which is the only caller.
 *
 * ── Why this is ~120 lines and not `firebase-admin` ──────────────────────────
 *
 * The obvious reason is weight: firebase-admin is a large dependency to carry in the Node
 * build for one HTTP endpoint. The better reason is that the thing it is usually reached for
 * no longer exists. FCM retired the `batch` endpoint, so `sendEachForMulticast` is itself one
 * HTTP request per token issued in parallel — exactly what `sendPush` does below. There is no
 * round trip to be saved by taking the dependency, which is the only argument that would
 * outweigh it in a codebase that counts statements (see "Round trips are the cost" in
 * backend-architecture.md).
 *
 * What is left is an OAuth2 access token, and this app already mints and verifies JWTs with
 * `jose` — `requireViewer` verifies Supabase's against its JWKS in-process rather than paying
 * a round trip to ask. Signing one for Google is the same tool pointed the other way.
 *
 * ── Why not topics ──────────────────────────────────────────────────────────
 *
 * A topic (`/topics/org_<id>`) would make the NEW_POST fan-out a single request instead of
 * one per member, which is genuinely tempting. It is still wrong here, and the reason is the
 * project's own revocation model: `Membership.status` is read from the database on every
 * authorization decision precisely so that removing somebody bites on their next request
 * however old their session is. A topic subscription lives in Firebase, not in our database,
 * so it is an authorization fact that can drift — a revoked member keeps receiving a parish's
 * pushes until an unsubscribe call succeeds, and nothing reconciles it if one never does.
 * That is the same class of bug as the `verified` column that was removed from `Profile` for
 * being able to disagree with the role it claimed to describe.
 *
 * Per-token sends also let the payload be per-recipient, which a topic cannot, and a parish
 * or a diocese is hundreds of devices — the fan-out already writes a row per member. */

const PROJECT_ID = process.env.FCM_PROJECT_ID
const CLIENT_EMAIL = process.env.FCM_CLIENT_EMAIL
/* The service account's private key. Newlines are escaped when it travels through an
 * environment variable, and `importPKCS8` rejects the key outright if they are left that way
 * — so unescape here rather than asking every deploy target to preserve real newlines. */
const PRIVATE_KEY = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n")

/* Whether push is wired up at all. False in local development and on any deploy that has not
 * been given the service account, and every entry point below turns into a no-op — the
 * notification row is still written, the panel still shows it, and only the delivery is
 * missing. Push must never be a reason a like fails. */
export const pushConfigured = () => Boolean(PROJECT_ID && CLIENT_EMAIL && PRIVATE_KEY)

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging"

/* ---------------------------------------------------------------------------
 * Access token
 * ------------------------------------------------------------------------- */

/* Google's access tokens last an hour, so minting one per send would add two round trips to
 * every like — one to sign nothing (that part is local) and one to exchange. Cached at module
 * scope, which is per process: the web target is one long-lived Node server, the same fact
 * that makes the session pooler the right choice for `DATABASE_URL`.
 *
 * `expiresAt` is set a minute short of the real expiry so a token cannot be handed out and
 * then rejected while the request carrying it is still in flight. `inflight` collapses a
 * concurrent stampede — a parish publishing to 200 devices asks 200 times at once otherwise
 * — into one exchange that every caller awaits. */
let cached = { token: null, expiresAt: 0 }
let inflight = null

const SKEW_MS = 60_000

const mintAccessToken = async () => {
    const key = await importPKCS8(PRIVATE_KEY, "RS256")

    const assertion = await new SignJWT({ scope: SCOPE })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(CLIENT_EMAIL)
        .setSubject(CLIENT_EMAIL)
        .setAudience(TOKEN_URL)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(key)

    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
        }),
    })

    if (!res.ok) {
        throw new Error(`FCM auth failed (${res.status}): ${await res.text()}`)
    }

    const { access_token: token, expires_in: expiresIn } = await res.json()
    cached = { token, expiresAt: Date.now() + expiresIn * 1000 - SKEW_MS }
    return token
}

const accessToken = async () => {
    if (cached.token && Date.now() < cached.expiresAt) return cached.token

    inflight ??= mintAccessToken().finally(() => {
        inflight = null
    })

    return inflight
}

/* ---------------------------------------------------------------------------
 * Send
 * ------------------------------------------------------------------------- */

/* How many sends are in the air at once. FCM has no batch endpoint, so a parish of 200 is 200
 * requests; letting all of them go simultaneously is what exhausts sockets and gets a shared
 * IP rate-limited. Sequential would be far too slow for the same fan-out. */
const CONCURRENCY = 16

/* FCM's verdict that a token is dead — and **only** that verdict, because acting on it
 * deletes a row. Three answers qualify, and every one of them is about the *token* rather
 * than about the request:
 *
 *   UNREGISTERED (404)        the app was uninstalled, or the token was replaced
 *   SENDER_ID_MISMATCH (403)  the token belongs to a different Firebase project
 *   INVALID_ARGUMENT (400)    …but only when the offending field is `message.token`
 *
 * **That last qualifier is the whole point of this function.** FCM returns
 * `INVALID_ARGUMENT` for a malformed token *and* for a malformed message, and the status and
 * the error code are identical in both cases. What separates them is the field path, which
 * FCM does report — verified against the live API:
 *
 *   bad token    field: "message.token"          "not a valid FCM registration token"
 *   bad payload  field: "message.data[0].value"  "Invalid value at … (TYPE_STRING), 123"
 *
 * Matching on the code alone collapses those two into one verdict, and the consequence is
 * not symmetric: a payload mistake — a non-string in `data` is the classic one — fails
 * identically for *every* recipient, so it would delete every device in the parish on a
 * single bad publish, with nothing to bring them back short of each person reopening the app.
 * A stale token that lingers is a bounded leak; a mass deletion is not recoverable.
 *
 * Everything else (a 5xx, a timeout, a quota) is transient and the token must survive it for
 * the same reason: a device deleted because Google had a bad minute goes silent with no path
 * back. */
const isUnregistered = (status, error) => {
    if (status === 404) return true
    if (status === 403) return error?.details?.some((d) => d.errorCode === "SENDER_ID_MISMATCH")

    if (status !== 400) return false

    /* Only when FCM named the token as the offending field. A violation anywhere else in the
     * message is our bug, and the token is innocent. */
    return (error?.details ?? []).some((detail) =>
        (detail.fieldViolations ?? []).some((v) => v.field === "message.token"),
    )
}

/* One `messages:send`. Resolves with the token when FCM has disowned it, else null. Never
 * rejects: a send is best-effort by construction, and the caller is a fire-and-forget after a
 * committed transaction that must not be given anything to catch. */
const sendOne = async (token, message, auth) => {
    try {
        const res = await fetch(
            `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${auth}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ message: { ...message, token } }),
            },
        )

        if (res.ok) return null

        const body = await res.text().catch(() => "")
        let error = null
        try {
            error = JSON.parse(body).error
        } catch {
            /* A non-JSON body is a proxy or an outage, never a verdict about the token. */
        }

        if (isUnregistered(res.status, error)) return token

        /* A 400 that was *not* about the token is our bug, and it is worth its own line: it
         * fails identically for every recipient, so it shows up as a whole parish receiving
         * nothing, with the cause buried in however many identical log entries. */
        if (res.status === 400) {
            console.error(
                "[push] the message is malformed, not the token — every recipient of this " +
                    `send will fail: ${error?.message ?? body.slice(0, 300)}`,
            )
            return null
        }

        console.error(`[push] ${res.status} for one token: ${body.slice(0, 300)}`)
        return null
    } catch (error) {
        console.error("[push] send failed", error)
        return null
    }
}

/* Delivers one payload to many tokens, and answers the ones FCM says no longer exist.
 *
 * `message` is an FCM HTTP v1 message minus its `token`, which is filled in per send. The
 * shape is assembled by `notifications.service.js`; nothing about a post or a like is known
 * here.
 *
 * Returns `[]` — not a throw — when push is unconfigured or there are no tokens, so callers
 * need no guard of their own. */
export const sendPush = async (tokens, message) => {
    if (!pushConfigured() || tokens.length === 0) return []

    let auth
    try {
        auth = await accessToken()
    } catch (error) {
        console.error("[push] could not obtain an access token", error)
        return []
    }

    const dead = []
    /* A fixed pool of workers pulling from a shared cursor: bounded concurrency without a
     * dependency, and without the tail latency of chunking into fixed batches (where every
     * batch waits on its own slowest request before the next one starts). */
    let next = 0
    const worker = async () => {
        while (next < tokens.length) {
            const token = tokens[next++]
            const expired = await sendOne(token, message, auth)
            if (expired) dead.push(expired)
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, tokens.length) }, worker),
    )

    return dead
}
