export const ROUTES = {
    DEFAULT: "/",
    INBOX: "/inbox",
    GROUPS: "/groups",
    POST: "/p",
    SETTINGS: "/settings",
    SETTINGS_USERS: "/settings/users",
    PUBLIC: {
        LOGIN: "/login",
    },
}

/* Slide routes — the single source of truth for every route that opens as a sliding
 * overlay instead of a normal page swap (see the "Slide routes" section of
 * `.claude/skills/develop/frontend-architecture.md`).
 *
 * A slide route is reached by a soft nav from inside the app, is intercepted so the
 * surface *behind* it stays mounted (scroll position intact), and pushes that base
 * surface off-screen as it swipes in. Registering one here is what makes the whole
 * shell treat it correctly — the top-level page transition doesn't cross-fade it
 * (`pageTransitionKey`), the nav keeps the base route highlighted (`isRouteActive`),
 * and `<SlideRouter/>` renders + animates it. Routes not listed here are untouched.
 *
 *   prefix — the route's static prefix; the segment after it is the dynamic param.
 *   base   — the route whose surface stays mounted underneath and gets pushed. */
export const SLIDE_ROUTES = [
    { prefix: ROUTES.POST, base: ROUTES.DEFAULT },
]

/* Route trees that must collapse to a single top-level page-transition key, because a
 * nested layout underneath runs its own <PageTransition/> for its sub-routes. Without
 * this the shell would cross-fade the whole pane on every sub-tab change. */
export const NESTED_TRANSITION_ROUTES = [ROUTES.SETTINGS]

/* Simulated network latency. Now applied **server-side**, inside the mock service layer
 * (`lib/server/posts.service.js`), because that is where the latency of a real backend
 * would live. It doubles as the minimum first-load skeleton duration: no read resolves
 * faster than this, so a skeleton is always on screen long enough to read and there is no
 * sub-perceptual flash to debounce away.
 *
 * Stores must therefore NOT add their own `Promise.all([fetch, mockDelay()])` floor any
 * more — the floor is already in the response, and racing it again just doubles every
 * load. See `.claude/skills/develop/backend-architecture.md`. */
export const MOCK_LATENCY_MS = 1000

/* Writes settle faster than reads so an optimistic mutation reconciles promptly. */
export const MOCK_WRITE_LATENCY_MS = 300

/* ---------------------------------------------------------------------------
 * API
 * ------------------------------------------------------------------------- */

/* Where the client sends API requests.
 *
 * Default is the same-origin `/api` tree of route handlers, which only exists in the Node
 * build. The native app is a static export with no server of its own, so it MUST be
 * pointed at a deployed instance by absolute URL via `NEXT_PUBLIC_API_BASE_URL`. See
 * `.claude/skills/develop/backend-architecture.md`.
 *
 * The base path is inlined here rather than imported from `basePath()` in `lib/utils.js`,
 * because utils.js imports this file — it must stay in sync with it by hand. */
export const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    `${(process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "")}/api`

/* Every endpoint the client calls, relative to API_BASE. Parameterized paths are
 * functions so no caller ever builds a URL by hand. */
export const API_ENDPOINTS = {
    FEED: "/feed",
    POST: (postId) => `/posts/${postId}`,
    POST_COMMENTS: (postId) => `/posts/${postId}/comments`,
    POST_LIKES: (postId) => `/posts/${postId}/likes`,
    COMMENT_LIKES: (commentId) => `/comments/${commentId}/likes`,
}

/* How many items a page pulls, per collection. The server clamps to its own maximum. */
export const PAGE_SIZE = {
    FEED: 5,
    COMMENTS: 8,
}

/* Machine-readable error codes the client may branch on. **Keep this in sync with
 * `ERROR_CODES` in `lib/server/errors.js`** — the two halves of the wire contract. This
 * copy carries the extra client-only `NETWORK` code, which no server ever sends: it is
 * what `lib/api.js` throws when the request never completed. */
export const ERROR_CODES = {
    VALIDATION_FAILED: "VALIDATION_FAILED",
    UNAUTHENTICATED: "UNAUTHENTICATED",
    PERMISSION_DENIED: "PERMISSION_DENIED",
    NOT_FOUND: "NOT_FOUND",
    CONFLICT: "CONFLICT",
    RATE_LIMITED: "RATE_LIMITED",
    INTERNAL: "INTERNAL",
    UNAVAILABLE: "UNAVAILABLE",
    NETWORK: "NETWORK",
}
