import { API_BASE, ERROR_CODES } from "@/lib/constants"
import { accessToken } from "@/lib/supabase"

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
         * fresh per request — `accessToken()` refreshes it if it has expired — so it must
         * never be hoisted or cached, or a long session starts 401ing when the token
         * behind it rotates.
         *
         * Absent when signed out, which is correct: the request goes out anonymous and the
         * server answers 401. */
        const token = await accessToken().catch(() => null)

        let res
        try {
            res = await fetch(url, {
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
            throw new ApiError({
                code: ERROR_CODES.NETWORK,
                message: "Can't reach the server. Check your connection and try again.",
            })
        }

        if (raw) return res

        /* 204 carries no body by contract, so don't try to parse one. */
        if (res.status === 204) return null

        const json = await res.json().catch(() => null)

        if (!res.ok) {
            /* A 401 means the session is over — the token expired past refresh, was
             * revoked, or the account was removed. Toasting "sign in to continue" while
             * leaving a signed-in shell on screen would be a dead end, so the app signs
             * out and the route gates take the viewer to /login.
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

    static delete(endpoint, options = {}) {
        return this.grab("delete", endpoint, null, options)
    }
}

export default API
