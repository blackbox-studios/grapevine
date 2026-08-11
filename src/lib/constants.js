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

/* Simulated network latency for mock store actions. Also serves as the minimum
 * first-load skeleton duration: store actions race their fetch against a
 * `mockDelay(MOCK_LATENCY_MS)` floor via Promise.all, so the skeleton is always
 * visible for at least this long — no sub-perceptual flash to debounce away. See
 * `.claude/skills/develop/frontend-architecture.md`. */
export const MOCK_LATENCY_MS = 1000
