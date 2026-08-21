import "server-only"

import { AppError, ERROR_CODES, ERROR_STATUS } from "@/lib/server/errors"

/* Correlation id for one request. Echoed on every response and embedded in every error
 * body so a client-side report can be matched to a server log line. */
const newRequestId = () => `req_${Math.random().toString(36).slice(2, 10)}`

/* Cross-origin access.
 *
 * The web app is same-origin with `/api`, so it needs no CORS at all. The *native* app is
 * a different story: a Capacitor WebView loads the bundle from a `capacitor://` or
 * `https://localhost` origin and calls the API by absolute URL (NEXT_PUBLIC_API_BASE_URL),
 * which makes every request cross-origin. Those origins are allow-listed here.
 *
 * `lib/api.js` sends `credentials: "include"`, so the allow-origin header must echo the one
 * requesting origin (never `*`) and be paired with allow-credentials. Extra origins (a LAN
 * IP for a physical device, a tunnel host) can be added via `CORS_ALLOWED_ORIGINS`, a
 * comma-separated list. */
const ALLOWED_ORIGINS = new Set([
    "capacitor://localhost", // iOS Capacitor WebView
    "https://localhost", // Android Capacitor WebView (default scheme)
    "http://localhost", // Android Capacitor WebView (cleartext)
    "http://localhost:3000", // local web dev / a same-machine client
    ...(process.env.CORS_ALLOWED_ORIGINS?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean) ?? []),
])

/* The requesting origin if it's allowed, else null. */
const allowedOrigin = (request) => {
    const origin = request.headers.get("origin")
    return origin && ALLOWED_ORIGINS.has(origin) ? origin : null
}

/* Stamps the allow-origin/credentials pair onto a response for an allowed origin, and marks
 * the response as varying by Origin so a cache never serves one origin's headers to
 * another. A null origin (same-origin, or a disallowed one) is left untouched. */
const applyCors = (response, origin) => {
    if (!origin) return response
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Credentials", "true")
    response.headers.append("Vary", "Origin")
    return response
}

/* Preflight (CORS `OPTIONS`) answer. Route handlers get no auto-CORS, so each collection or
 * resource file that a cross-origin client hits must `export const OPTIONS = preflight`. */
export const preflight = (request) => {
    const origin = allowedOrigin(request)
    const response = new Response(null, { status: 204 })
    if (origin) {
        applyCors(response, origin)
        response.headers.set(
            "Access-Control-Allow-Methods",
            "GET, POST, PATCH, PUT, DELETE, OPTIONS",
        )
        /* Echo what the browser asked for; the fallback lists what this API actually
         * reads. `Authorization` is on it because every endpoint is authenticated by a
         * bearer token — omit it and the native app's preflight passes while the real
         * request is stripped of its credentials and 401s. */
        response.headers.set(
            "Access-Control-Allow-Headers",
            request.headers.get("access-control-request-headers") ||
                "Authorization, Content-Type, X-Request-Id",
        )
        response.headers.set("Access-Control-Max-Age", "86400")
    }
    return response
}

/* Serializes any throw into the single documented failure shape:
 *
 *   { error: { code, message, fields?, requestId, retryAfter? } }
 *
 * An AppError carries its own code and a message that is safe to show. Anything else is an
 * unhandled fault: it is logged in full server-side and reduced to a generic INTERNAL
 * message on the wire, so an exception message, stack, or database error can never leak to
 * a client. */
const toErrorResponse = (error, requestId) => {
    const known = error instanceof AppError

    if (!known) console.error(`[${requestId}]`, error)

    const status = known ? error.status : ERROR_STATUS[ERROR_CODES.INTERNAL]
    const body = {
        error: {
            code: known ? error.code : ERROR_CODES.INTERNAL,
            message: known
                ? error.message
                : "Something went wrong. Please try again.",
            ...(known && error.fields ? { fields: error.fields } : {}),
            ...(known && error.retryAfter ? { retryAfter: error.retryAfter } : {}),
            requestId,
        },
    }

    return Response.json(body, {
        status,
        ...(known && error.retryAfter
            ? { headers: { "Retry-After": String(error.retryAfter) } }
            : {}),
    })
}

/* Wraps a route handler so it can be written as pure happy path: read the request, call a
 * service, hand the result to a `respond.js` helper, and throw an `AppError` for anything
 * that can't be done. This is where the boilerplate's `catchAsync` + `requestId` +
 * `errorHandler` middleware all land, since a route handler has no middleware chain.
 *
 * Every handler must be wrapped. An unwrapped one leaks stack traces on a 500 and skips
 * the request-id and cache headers. */
export const route = (handler) => async (request, context) => {
    const requestId = request.headers.get("x-request-id") || newRequestId()
    const origin = allowedOrigin(request)

    let response
    try {
        response = await handler(request, context)
    } catch (error) {
        response = toErrorResponse(error, requestId)
    }

    response.headers.set("X-Request-Id", requestId)
    /* Everything here is per-viewer and mutable in-session; nothing may be cached. */
    response.headers.set("Cache-Control", "no-store")
    return applyCors(response, origin)
}

/* Reads and validates the pagination params shared by every collection endpoint.
 * `limit` is clamped so a client can't ask for the whole table in one call.
 *
 * `extra` names any additional query keys the route wants, read straight through as
 * strings (or null when absent) and merged into the same object, so the result can be
 * handed to a service in one spread. It exists so a route that needs a filter alongside
 * its page does not parse `request.url` a second time to get it — see `api/feed`, whose
 * `orgId` arrives this way. Validating those values is the service's job, not this one's;
 * only `limit` is clamped here because only `limit` bounds the query. */
export const pageParams = (request, { fallback, max = 50, extra = [] }) => {
    const params = new URL(request.url).searchParams
    const requested = Number.parseInt(params.get("limit") ?? "", 10)
    const limit = Number.isFinite(requested)
        ? Math.min(Math.max(requested, 1), max)
        : fallback

    return {
        limit,
        cursor: params.get("cursor"),
        ...Object.fromEntries(extra.map(key => [key, params.get(key)])),
    }
}
