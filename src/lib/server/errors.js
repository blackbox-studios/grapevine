import "server-only"

/* The error-code → status registry. **Keep in sync with `ERROR_CODES` in
 * `lib/constants.js`** — they are the two halves of one wire contract, and the client
 * branches on these strings. Add a code here (with its status) before using it.
 *
 * The client copy additionally carries `NETWORK`, which no server ever sends. */
export const ERROR_CODES = {
    VALIDATION_FAILED: "VALIDATION_FAILED",
    UNAUTHENTICATED: "UNAUTHENTICATED",
    PERMISSION_DENIED: "PERMISSION_DENIED",
    NOT_FOUND: "NOT_FOUND",
    CONFLICT: "CONFLICT",
    RATE_LIMITED: "RATE_LIMITED",
    INTERNAL: "INTERNAL",
    UNAVAILABLE: "UNAVAILABLE",
}

export const ERROR_STATUS = {
    [ERROR_CODES.VALIDATION_FAILED]: 400,
    [ERROR_CODES.UNAUTHENTICATED]: 401,
    [ERROR_CODES.PERMISSION_DENIED]: 403,
    [ERROR_CODES.NOT_FOUND]: 404,
    [ERROR_CODES.CONFLICT]: 409,
    [ERROR_CODES.RATE_LIMITED]: 429,
    [ERROR_CODES.INTERNAL]: 500,
    [ERROR_CODES.UNAVAILABLE]: 503,
}

/* The only thing a service should throw. Services never touch the response — they throw
 * this, and `route()` in `handler.js` serializes it into the one documented failure shape.
 * Never hand-roll a failure response in a route handler. */
export class AppError extends Error {
    constructor(code, message, { fields, retryAfter } = {}) {
        super(message)
        this.name = "AppError"
        this.code = code
        this.status = ERROR_STATUS[code] ?? 500
        this.fields = fields
        this.retryAfter = retryAfter
    }
}

export const notFound = (message) => new AppError(ERROR_CODES.NOT_FOUND, message)

/* Authenticated, and not permitted. Reach for `notFound` instead wherever confirming the
 * resource exists would itself leak something — see the note on `requireMembership`. */
export const forbidden = (message) => new AppError(ERROR_CODES.PERMISSION_DENIED, message)

export const invalid = (message, fields) =>
    new AppError(ERROR_CODES.VALIDATION_FAILED, message, { fields })

/* Conflicts with the state the resource is actually in — a slot that filled up between the
 * page being drawn and the button being pressed, a person already signed up for it. Distinct
 * from a validation failure on purpose: nothing about the request was malformed, and the
 * client's response to it is to re-read rather than to correct a field. */
export const conflict = (message) => new AppError(ERROR_CODES.CONFLICT, message)

/* A dependency this app does not own could not be reached — the auth service, a parish's
 * calendar feed. **Never a 500**, and never a 401: those say the caller did something, and a
 * third party being down is not something a caller did. `lib/api.js` signs a viewer out on a
 * 401, which is why the distinction is load-bearing rather than pedantic. */
export const unavailable = (message, { retryAfter } = {}) =>
    new AppError(ERROR_CODES.UNAVAILABLE, message, { retryAfter })

/* No credentials, or credentials that do not check out. Reached from `auth.js` on every
 * ordinary request and from the reminders endpoint, which authenticates a schedule rather than
 * a person. **A 401 signs the viewer out** (`lib/api.js` calls `expire()` on one), so it must
 * mean "your credentials are wrong" and never "the check could not run" — that is
 * `unavailable`. */
export const unauthenticated = (message = "Sign in to continue.") =>
    new AppError(ERROR_CODES.UNAUTHENTICATED, message)
