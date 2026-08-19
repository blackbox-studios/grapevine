export const ROUTES = {
    DEFAULT: "/",
    INBOX: "/inbox",
    POST: "/p",
    SETTINGS: "/settings",
    SETTINGS_USERS: "/settings/users",
    /* Signed in, but not yet through the door — see components/MemberGate.jsx. */
    WELCOME: "/welcome",
    ACCESS: "/access",
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
 * Stores that talk to the API must NOT add a floor of their own — and that rule got sharper
 * once the API's own round trips were cut: a warm feed page now answers in a third of a
 * second, so a floor there would be the slowest thing left in the request. */
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
    ME_ONBOARDING: "/me/onboarding",
    /* Is this @handle free? Answered live while the viewer types one during orientation,
     * so a collision surfaces on the step that caused it rather than after the last one. */
    ME_HANDLE: "/me/onboarding/handle",
    ORGS: "/orgs",
    ORG_MEMBERS: (orgId) => `/orgs/${orgId}/members`,
    ORG_INVITES: (orgId) => `/orgs/${orgId}/invites`,
    MEMBERSHIP: (membershipId) => `/memberships/${membershipId}`,
    FEED: "/feed",
    /* Collection root — POST here to publish (admin only). */
    POSTS: "/posts",
    POST: (postId) => `/posts/${postId}`,
    POST_COMMENTS: (postId) => `/posts/${postId}/comments`,
    POST_LIKES: (postId) => `/posts/${postId}/likes`,
    /* DELETE only — the author's own comment, or anyone's for an admin of the group. */
    COMMENT: (commentId) => `/comments/${commentId}`,
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

/* Where a person stands in the life of the parish. **Presentational only** — a vocation
 * never grants a permission; that is `ROLES`. A parish can have a Reader who administers
 * the feed and a Priest who does not.
 *
 * One value per person, never a set — these standings are mutually exclusive, so nobody is
 * both a matushka and an ordained reader.
 *
 * Declared in the same order as the Postgres enum, which sorts by physical position and is
 * what the roster orders on. Keep the two in step. */
export const VOCATIONS = {
    CATECHUMEN: "CATECHUMEN",
    FAITHFUL: "FAITHFUL",
    READER: "READER",
    /* A priest's wife. Slavic usage deliberately, not the Greek "Presbytera". */
    MATUSHKA: "MATUSHKA",
    DEACON: "DEACON",
    PRIEST: "PRIEST",
    BISHOP: "BISHOP",
}

/* How a vocation prefixes a name, for the vocations that carry a form of address.
 *
 * **This is the only place a title is written down.** Titles used to live inside stored
 * name strings — an admin typed "Dn. Paul" into a full-name box — which made the rank part
 * of the person's name and left their surname unrecorded. Deriving it here means ordaining
 * a reader as a deacon is a vocation change and nothing else, and that nobody can be
 * addressed as a rank they do not hold.
 *
 * Absent (CATECHUMEN, FAITHFUL) means no title, which is not the same as an empty string:
 * `displayName()` branches on whether a title exists to decide between "Dn. Paul" and
 * "Jordan Rivera". See `lib/name.js`.
 *
 * "Priest" rather than the colloquial "Fr.", and the Slavic "Mat." rather than the Greek
 * "Presbytera", matching the vocation names themselves. */
export const VOCATION_TITLE = {
    [VOCATIONS.BISHOP]: "Bp.",
    [VOCATIONS.PRIEST]: "Priest",
    [VOCATIONS.DEACON]: "Dn.",
    [VOCATIONS.MATUSHKA]: "Mat.",
    [VOCATIONS.READER]: "Reader",
}

/* The same ranks as they appear inside a **handle** — "rdr.justinian", "mat.carly".
 *
 * A second map rather than a lowercased `VOCATION_TITLE`, because the two answer different
 * questions. A title is prose and can carry punctuation and full words ("Reader Michael");
 * a handle is an identifier constrained to `HANDLE_PATTERN`, so it wants the short spoken
 * abbreviation with no trailing dot — `rdr`, not `reader` or `Reader.`. Deriving one from
 * the other would mean "Priest" becoming `priest.alexander` and "Bp." becoming `bp..nicholas`.
 *
 * Only a suggestion. It prefills the handle step, which is editable, and nothing downstream
 * requires a handle to match anybody's rank — a reader who wants `justinian` simply types
 * it, and a handle is not re-derived when someone is later ordained. */
export const VOCATION_HANDLE_PREFIX = {
    [VOCATIONS.BISHOP]: "bp",
    [VOCATIONS.PRIEST]: "fr",
    [VOCATIONS.DEACON]: "dn",
    [VOCATIONS.MATUSHKA]: "mat",
    [VOCATIONS.READER]: "rdr",
}

/* What a @handle may be, checked identically on both sides of the wire — the client for
 * the message it shows while typing, `normalizeHandle` on the server for the answer that
 * actually decides. Lowercase because handles are compared exactly and a case-sensitive
 * @mention is a trap; bounded by alphanumerics at both ends so nothing reads as "@.foo" or
 * trails a separator.
 *
 * Note this is stricter than what `deriveHandle` produces at admission: a two-letter email
 * local part yields a provisional handle too short to pass here. That is intended — the
 * provisional handle is a placeholder, and orientation is where it must be replaced by one
 * a person actually chose. */
export const HANDLE_MIN = 3
export const HANDLE_MAX = 24
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9._-]{1,22}[a-z0-9]$/

/* Ordered for a picker, so the admin sees ranks in the order the parish thinks of them
 * rather than however Object.keys happens to enumerate. */
export const VOCATION_OPTIONS = [
    VOCATIONS.CATECHUMEN,
    VOCATIONS.FAITHFUL,
    VOCATIONS.READER,
    VOCATIONS.MATUSHKA,
    VOCATIONS.DEACON,
    VOCATIONS.PRIEST,
    VOCATIONS.BISHOP,
]

/* Whether a signed-in viewer may use the app, and if not, why.
 *
 * Derived server-side from their memberships (see `projectViewer`) rather than left for
 * the client to work out, so the gate has one value to branch on and cannot disagree with
 * what the API would enforce.
 *
 *   ACTIVE   at least one APPROVED membership — the app opens
 *   REVOKED  access was removed
 *   NONE     signed in but belongs to nothing at all
 *
 * There is no "waiting on approval" state: an admin admits people, nobody asks to join,
 * and a membership is APPROVED from the moment it exists. */
export const ACCESS = {
    ACTIVE: "ACTIVE",
    REVOKED: "REVOKED",
    NONE: "NONE",
}

/* Membership access states — in the parish, or removed from it. APPROVED is what puts a
 * group's posts in the viewer's feed. Mirrors `MembershipStatus` in schema.prisma; read the
 * admission note in that file's header before adding a third value. */
export const MEMBERSHIP_STATUS = {
    APPROVED: "APPROVED",
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
