import { API_BASE, ERROR_CODES } from "@/lib/constants"

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

        let res
        try {
            res = await fetch(url, {
                method: method.toUpperCase(),
                headers: { "Content-Type": "application/json" },
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
            /* TODO: once a real session exists, a 401 on anything other than the login /
             * session endpoints means the session expired, and the app should sign out
             * rather than toast. Do it by importing the auth store lazily here (a
             * top-level import would make api.js ↔ auth/store.js circular). Mock auth
             * never issues a 401, so there is nothing to trigger it yet. */
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
