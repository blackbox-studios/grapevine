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

/* Simulated network latency for mock store actions. Also serves as the minimum
 * first-load skeleton duration: store actions race their fetch against a
 * `mockDelay(MOCK_LATENCY_MS)` floor via Promise.all, so the skeleton is always
 * visible for at least this long — no sub-perceptual flash to debounce away. See
 * `.claude/skills/develop/frontend-architecture.md`. */
export const MOCK_LATENCY_MS = 1000
