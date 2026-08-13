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

export const invalid = (message, fields) =>
    new AppError(ERROR_CODES.VALIDATION_FAILED, message, { fields })
