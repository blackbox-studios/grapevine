import { API_BASE, ERROR_CODES } from "@/lib/constants"
import { refreshSession, sessionToken } from "@/lib/supabase"

/* The one error type every failed request throws, success or network fault alike, so a
 * store's `catch` never has to inspect `res.ok`, `res.status`, or a response body.
 *
 * `code` is the stable, machine-readable half of the contract and the only thing a caller
 * should branch on; `message` is human-readable and safe to show. See
 * `.claude/skills/develop/backend-architecture.md` §4. */
export class ApiError extends Error {
    constructor({ code, message, fields, requestId, status }) {
        super(message || "Something went wrong. Please try again.")
        this.name = "ApiError"
        this.code = code || ERROR_CODES.INTERNAL
        this.fields = fields
        this.requestId = requestId
        this.status = status ?? 0
    }
}

/* The single seam between the app and the API. Stores are the only layer that touches it
 * (see frontend-architecture.md → Layered Architecture); components and effects must
 * never call it directly.
 *
 * Options:
 *   params — an object serialized to a query string (pagination, filters).
 *   raw    — resolve with the Response instead of parsed JSON (downloads, streaming).
 * Anything else is forwarded to `fetch` untouched. */
const offline = () =>
    new ApiError({
        code: ERROR_CODES.NETWORK,
        message: "Can't reach the server. Check your connection and try again.",
    })

class API {
    static async grab(method, endpoint, body = null, options = {}) {
        const { params, raw, ...rest } = options

        const query = params ? `?${new URLSearchParams(params).toString()}` : ""
        const url = `${API_BASE}${endpoint}${query}`

        /* The Supabase access token, as a bearer header.
         *
         * A header rather than a cookie, because the native app is cross-origin against a
         * deployed API (`capacitor://localhost` → `https://synaxis.chat/api`) and a
         * third-party cookie is not something to build a session on. The token is read
         * fresh per request — `sessionToken()` refreshes it if it is near expiry — so it
         * must never be hoisted or cached, or a long session starts 401ing when the token
         * behind it rotates. */
        const send = async (token) => {
            try {
                return await fetch(url, {
                    method: method.toUpperCase(),
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    credentials: "include",
                    ...rest,
                    ...(body ? { body: JSON.stringify({ ...body }) } : {}),
                })
            } catch {
                /* The request never completed — offline, DNS, CORS, an aborted connection.
                 * There is no status and no body to read, so this is the one failure the
                 * client has to name itself. */
                throw offline()
            }
        }

        const { token, stale } = await sessionToken().catch(() => ({
            token: null,
            stale: false,
        }))

        /* A session exists but could not be refreshed just now — see `sessionToken`. Do
         * **not** send this anonymously: the 401 it would earn is indistinguishable from a
         * revoked session and signs the viewer out over a dropped connection. Fail it as
         * what it is, a network fault, and let the caller retry. */
        if (!token && stale) throw offline()

        /* No token and no session is the real anonymous case, and the 401 is correct. */
        let res = await send(token)

        /* One retry behind a forced refresh, before a 401 is allowed to mean anything.
         *
         * A token can be rejected while the session behind it is perfectly sound, and on a
         * phone it regularly is: the device clock drifts and the server sees an `exp` that
         * has already passed, or the app was asleep and the token aged out between the
         * store read and the request landing, or a key rotation is halfway through. All of
         * those are cured by asking for a new token, and none of them is a reason to put a
         * login screen in front of someone. Only a 401 that survives a fresh token is a
         * verdict.
         *
         * Safe to replay: a 401 means the server rejected the caller before doing anything,
         * so even a POST has had no effect. */
        if (res.status === 401 && token) {
            const refreshed = await refreshSession()

            if (refreshed) {
                res = await send(refreshed)
            } else if ((await sessionToken().catch(() => ({ stale: false }))).stale) {
                /* The refresh could not run at all rather than being refused. The session
                 * is very probably fine; don't destroy it over an outage. */
                throw offline()
            }
        }

        if (raw) return res

        /* 204 carries no body by contract, so don't try to parse one. */
        if (res.status === 204) return null

        const json = await res.json().catch(() => null)

        if (!res.ok) {
            /* A 401 that has already survived a forced refresh (above) means the session
             * really is over — the refresh token was revoked, the account was removed, or
             * the Profile is gone. Toasting "sign in to continue" while leaving a
             * signed-in shell on screen would be a dead end, so the app signs out and the
             * route gates take the viewer to /login.
             *
             * Everything transient has been filtered out before this point, and it has to
             * stay that way: this line is the only thing in the app that ends a session the
             * viewer did not ask to end.
             *
             * The auth store is imported lazily, inside the branch: a top-level import
             * would make api.js ↔ auth/store.js circular, since the store imports this
             * file to fetch the profile. */
            if (res.status === 401) {
                const { default: useAuthStore } = await import("@/lib/store/auth/store")
                useAuthStore.getState().expire()
            }
            throw new ApiError({ ...(json?.error ?? {}), status: res.status })
        }

        return json
    }

    static get(endpoint, options = {}) {
        return this.grab("get", endpoint, null, options)
    }

    static post(endpoint, body = {}, options = {}) {
        return this.grab("post", endpoint, body, options)
    }

    static put(endpoint, body = {}, options = {}) {
        return this.grab("put", endpoint, body, options)
    }

    /* Partial update. Used where the caller holds only the field it is changing rather
     * than a whole resource to replace — the roster's approve/revoke/re-rank actions. */
    static patch(endpoint, body = {}, options = {}) {
        return this.grab("patch", endpoint, body, options)
    }

    static delete(endpoint, options = {}) {
        return this.grab("delete", endpoint, null, options)
    }
}

export default API
