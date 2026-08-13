import "server-only"

import { AppError, ERROR_CODES, ERROR_STATUS } from "@/lib/server/errors"

/* Correlation id for one request. Echoed on every response and embedded in every error
 * body so a client-side report can be matched to a server log line. */
const newRequestId = () => `req_${Math.random().toString(36).slice(2, 10)}`

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

    let response
    try {
        response = await handler(request, context)
    } catch (error) {
        response = toErrorResponse(error, requestId)
    }

    response.headers.set("X-Request-Id", requestId)
    /* Everything here is per-viewer and mutable in-session; nothing may be cached. */
    response.headers.set("Cache-Control", "no-store")
    return response
}

/* Reads and validates the pagination params shared by every collection endpoint.
 * `limit` is clamped so a client can't ask for the whole table in one call. */
export const pageParams = (request, { fallback, max = 50 }) => {
    const params = new URL(request.url).searchParams
    const requested = Number.parseInt(params.get("limit") ?? "", 10)
    const limit = Number.isFinite(requested)
        ? Math.min(Math.max(requested, 1), max)
        : fallback

    return { limit, cursor: params.get("cursor") }
}
