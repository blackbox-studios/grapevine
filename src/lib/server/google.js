import "server-only"

import { SignJWT, importPKCS8 } from "jose"

/* The Firebase service account, and the OAuth2 access tokens minted from it.
 *
 * One credential does two jobs: `firebase.messaging` sends a push (`push.js`), and
 * `firebase.remoteconfig` reads the feature flags (`config.js`). Google issues a token per
 * scope, so that is what this module is for — a cache keyed by scope, and one exchange per
 * scope per hour. Without it each caller carries its own copy of the same forty lines and its
 * own copy of the stampede bug they exist to avoid.
 *
 * The credential is read from the FCM_* trio because push is what first asked for it, and
 * nothing about the values is push-specific: they are the Firebase project's service account.
 * Reaching another of its APIs is a new scope below, not a second key in `.env`.
 *
 * `jose` rather than `google-auth-library`, for the reason `push.js` gives about
 * `firebase-admin`: this app already mints and verifies JWTs with it, and signing an assertion
 * for Google is the same tool pointed the other way. */

const PROJECT_ID = process.env.FCM_PROJECT_ID
const CLIENT_EMAIL = process.env.FCM_CLIENT_EMAIL
/* Newlines are escaped when the key travels through an environment variable, and `importPKCS8`
 * rejects it outright in that form — so unescape here rather than asking every deploy target to
 * preserve real newlines. */
const PRIVATE_KEY = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n")

/* The Firebase project every API path below is built against. */
export const firebaseProject = () => PROJECT_ID

/* Whether the service account is present at all. False in local development and on any deploy
 * that has not been given it — every caller degrades to doing nothing rather than to failing,
 * so an unconfigured deploy is a supported state rather than a broken one. */
export const firebaseConfigured = () => Boolean(PROJECT_ID && CLIENT_EMAIL && PRIVATE_KEY)

export const SCOPES = {
    MESSAGING: "https://www.googleapis.com/auth/firebase.messaging",
    REMOTE_CONFIG: "https://www.googleapis.com/auth/firebase.remoteconfig",
}

const TOKEN_URL = "https://oauth2.googleapis.com/token"

/* Handed out a minute short of the real expiry, so a token cannot be given to a request that
 * is still in flight when it dies. */
const SKEW_MS = 60_000

/* Both keyed by scope, and both are per process — the web target is one long-lived Node
 * server, the same fact that makes the session pooler the right choice for `DATABASE_URL`.
 *
 * `inflight` collapses a concurrent stampede into one exchange every caller awaits: a parish
 * publishing to 200 devices asks for a messaging token 200 times at once otherwise. */
const cached = new Map()
const inflight = new Map()

const mint = async (scope) => {
    const key = await importPKCS8(PRIVATE_KEY, "RS256")

    const assertion = await new SignJWT({ scope })
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
        throw new Error(`Google auth failed for ${scope} (${res.status}): ${await res.text()}`)
    }

    const { access_token: token, expires_in: expiresIn } = await res.json()
    cached.set(scope, { token, expiresAt: Date.now() + expiresIn * 1000 - SKEW_MS })
    return token
}

/* An access token for one scope. Throws if the exchange fails; callers decide what a Google
 * outage means for the feature they are serving. */
export const googleAccessToken = async (scope) => {
    const entry = cached.get(scope)
    if (entry && Date.now() < entry.expiresAt) return entry.token

    if (!inflight.has(scope)) {
        inflight.set(
            scope,
            mint(scope).finally(() => inflight.delete(scope)),
        )
    }

    return inflight.get(scope)
}
