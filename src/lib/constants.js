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

/* Simulated network latency for what is *still* mocked.
 *
 * This used to be the API's floor, applied server-side so every read took at least a
 * second and a skeleton was guaranteed to be readable. Posts, comments, and the viewer now
 * come from Postgres, and real latency replaced it — the awaits are gone from the service
 * layer along with the mock corpus.
 *
 * What is left is the `app` store, whose dashboard surface has no endpoint yet and would
 * otherwise resolve in zero milliseconds and flash its skeleton. When that domain gets one,
 * this constant and `lib/mock.js` go with it.
 *
 * Stores that talk to the API must NOT add a floor of their own. */
export const MOCK_LATENCY_MS = 1000

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
    /* The session probe: who the viewer is and which groups they belong to. */
    ME: "/me",
    ORGS: "/orgs",
    ORG_MEMBERS: (orgId) => `/orgs/${orgId}/members`,
    FEED: "/feed",
    /* Collection root — POST here to publish (admin only). */
    POSTS: "/posts",
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

/* How many digits the emailed sign-in code has.
 *
 * **This is a project setting, not a constant of nature.** Supabase exposes it under
 * Authentication → Sign In / Providers → Email → Email OTP Length, and the current default
 * is 8 — despite a lot of documentation (and every tutorial) saying six. Hardcoding 6 here
 * is what made the login form silently unusable: `maxLength` truncated the real code and
 * validation then rejected what was left.
 *
 * Used for the placeholder and the on-screen copy. Validation is deliberately looser (see
 * the login page) so changing the dashboard setting cannot lock anyone out before someone
 * remembers to change this. */
export const OTP_LENGTH = 8

/* How long Supabase makes a user wait between OTP requests for the same address. Its
 * `/auth/v1/otp` endpoint enforces a 60-second window and rejects anything inside it, so
 * the login screen's resend affordance counts this down rather than firing into a
 * guaranteed error. Configurable in the dashboard under Authentication → Rate Limits; if
 * you change it there, change it here. */
export const OTP_RESEND_SECONDS = 60

/* ---------------------------------------------------------------------------
 * Roles and vocations
 *
 * Two different axes, and conflating them is the mistake this split exists to prevent —
 * see the header of `prisma/schema.prisma`.
 * ------------------------------------------------------------------------- */

/* What a viewer may DO, scoped to one group. Mirrors the `OrgRole` enum. Only an ADMIN of
 * a group may publish into it; a MEMBER may read, like, and comment. */
export const ROLES = {
    ADMIN: "ADMIN",
    MEMBER: "MEMBER",
}

/* Hierarchical comparison for `<Privileged/>`: a control requiring MEMBER is visible to an
 * ADMIN, but not the other way round. Keep the numbers spaced so a tier can be inserted
 * between two existing ones without renumbering. */
export const ROLE_LEVEL = {
    [ROLES.MEMBER]: 10,
    [ROLES.ADMIN]: 20,
}

/* Who a person IS. Presentational only — a vocation never grants a permission. A priest is
 * usually their parish's admin but need not be, and an admin need not be a priest. */
export const VOCATIONS = {
    PRIEST: "PRIEST",
    FAITHFUL: "FAITHFUL",
}

/* Membership approval states. APPROVED is the only one that puts a group's posts in the
 * viewer's feed; PENDING is a request awaiting an admin. */
export const MEMBERSHIP_STATUS = {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    REVOKED: "REVOKED",
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
