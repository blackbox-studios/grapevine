/* The browser tab's title. Two things write it — the root layout's `metadata`, and
 * `useUnreadTitle` prefixing the unread count — and a second copy would rename the tab. */
export const APP_NAME = "Grapevine"

/* Where a person writes to about their own data — corrections, questions, and the erasure
 * request that `npm run erase` answers. Published in the privacy policy and on the deletion
 * page, so it has to be a mailbox somebody actually reads. */
export const SUPPORT_EMAIL = "support@blackboxstudios.com"

/* Where somebody who has been admitted to a group goes to get the app. Sent in the
 * invitation email, which is the one place a person is told Grapevine exists at all.
 *
 * The web address is not here: it is the deploy's own `APP_BASE_URL`, which the server reads
 * (see `invites.js`), and a copy of it in the client bundle would be a second answer to
 * "where does this app live".
 *
 * `ios` is null until the app is accepted, and the email omits a row it has no link for
 * rather than sending a parishioner to a 404. */
export const APP_STORES = {
    /* Keyed by the `appId` in capacitor.config.json, which is what Play indexes the listing
     * under.
     *
     * TODO: confirm this resolves once the listing is public. It is only reachable while the
     * app is on a closed or internal track if the reader is on the tester list, so until
     * production rollout an invited parishioner may land on "item not found". */
    android: "https://play.google.com/store/apps/details?id=com.throughgrapevine.app",
    /* TODO: set this to `https://apps.apple.com/app/id<APPLE_ID>` once the app is accepted.
     * The email already renders the row and its button off this value, so filling it in is
     * the whole of shipping the iOS link. */
    ios: null,
}

/* What build the reader is holding, for `/settings/about`. Both are inlined by
 * `next.config.mjs` — see the note there for why they cannot be read at runtime.
 *
 * `APP_BUILD` is YYMMDDHHMM in UTC, which is a stamp rather than a number to compare: it
 * answers "which bundle is this" when two devices claim the same version, and it sorts. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"
export const APP_BUILD = new Date(process.env.NEXT_PUBLIC_BUILT_AT ?? Date.now())
    .toISOString()
    .replace(/\D/g, "")
    .slice(2, 12)

export const ROUTES = {
    DEFAULT: "/",
    /* Direct messages. The list is a page; one conversation is the slide route below,
     * nested under it so `isRouteActive` keeps the entrance lit while a thread is open. */
    INBOX: "/inbox",
    CONVERSATION: "/inbox/c",
    /* The Prologue of Ohrid for today, with the day's fasting rule. Not scoped to a group:
     * the reading is the same wherever it is read, which is why it sits beside Home in the
     * nav rather than anywhere in the group tree. */
    PROLOGUE: "/prologue",
    POST: "/p",
    NOTIFICATIONS: "/notifications",
    /* What is happening in this parish, and what it needs hands for. Two tabs over one
     * subject rather than two destinations: the parish's own calendar and its sign-up sheets
     * are the same question asked twice, and a rota nobody can see next to the feast it
     * serves is a rota nobody signs up for. Scoped to the selected group like everything
     * else, which is why there is no id in the path. */
    EVENTS: "/events",
    /* One sign-up sheet, by id — a real, shareable URL, which is the whole reason it exists: a
     * priest posting "sign up for coffee hour" needs a link that lands on that rota, and a
     * reminder should open the thing it is reminding you about.
     *
     * **Nested under `/events` on purpose.** `isRouteActive` is a segment-safe prefix test, so a
     * rota keeps the Events tab lit in the nav; a sibling `/s` would leave the rail dark on a
     * page that is plainly part of Events. */
    SIGNUP: "/events/s",
    /* The account surface, and the index of the settings tree: who the viewer is, and every
     * destination that hangs off them. A route rather than a menu, because it is where the
     * settings sub-pages and the roster are reached from — see
     * `app/(protected)/settings/page.jsx`. Everything below it is a row on that list. */
    SETTINGS: "/settings",
    SETTINGS_GENERAL: "/settings/general",
    /* The app itself: which build this is, who made it, and the copyright. In the account
     * tree because it is a fact about the copy of Grapevine in the reader's hand, and that is
     * where a person looks for one. */
    SETTINGS_ABOUT: "/settings/about",
    /* Everything about the *person* — name, handle, the parish facts, the picture. "Info"
     * rather than "Profile", so it reads the same as the group tree's own Info a level away:
     * the two settings surfaces are deliberately the same shape asked about different
     * subjects. */
    SETTINGS_INFO: "/settings/info",
    /* The group tree, and it is a **sibling** of the account tree rather than a branch of it.
     * A group is not a setting of yours: your role in it can change, you can be removed from
     * it, and the surface is admin-only where `/settings` is everyone's. Its own root is what
     * lets it be gated in one layout instead of per page, and what keeps `isRouteActive` from
     * lighting the account tab while somebody edits a parish. */
    GROUP: "/group",
    GROUP_INFO: "/group/info",
    GROUP_USERS: "/group/users",
    /* Signed in, but not yet through the door — see components/MemberGate.jsx. */
    WELCOME: "/welcome",
    ACCESS: "/access",
    PUBLIC: {
        LOGIN: "/login",
        /* The two legal documents, as real pages rather than only as the modals the login
         * screen opens. Play stores a *URL* for each and re-fetches it periodically, so a
         * screen inside the app cannot stand in for them however complete its text is. Both
         * live outside every gate — a reviewer reads them signed out, and a signed-in person
         * following a link must not be bounced into the feed. */
        PRIVACY: "/privacy",
        DELETE_ACCOUNT: "/delete-account",
    },
}

/* Runtime routes — the single source of truth for every route whose dynamic segment is
 * only knowable at **runtime**, and which therefore has no page file of its own.
 *
 * ── The constraint this exists for ──────────────────────────────────────────
 *
 * `output: "export"` (the native build — see native-architecture.md) requires
 * `generateStaticParams` for every dynamic segment, so a `/p/[postId]` folder would mean
 * enumerating every openable id at build time. A post id is a cuid from a live database and
 * a group id is no different: neither exists when the bundle is built.
 *
 * The way out is to stop asking the router. A runtime route is reached by **shallow history
 * navigation** — `history.pushState`, which the App Router reflects through `usePathname()`
 * without touching the segment tree — and the shell resolves the *pathname* against this
 * registry to decide what to draw. No segment, nothing to enumerate, real shareable URLs.
 * `/p/:postId` has shipped on device this way; everything here rides the same mechanism.
 *
 *   prefix — the route's static prefix; the segment after it is the dynamic param.
 *   slide  — how it presents. See below.
 *   base   — slide routes only: the route whose surface stays mounted underneath and gets
 *            pushed, and the fallback a cold deep link dismisses to.
 *   inline — slide routes only: above the md breakpoint this is an ordinary page rather
 *            than an overlay, because the surface it would cover has room to hold it.
 *
 * ── Two presentations, one mechanism ────────────────────────────────────────
 *
 * `slide: true` is the overlay: the surface behind stays mounted and is pushed off-screen,
 * the top-level page transition is suppressed (`pageTransitionKey`), the nav keeps the base
 * route highlighted (`isRouteActive`), and `<SlideRouter/>` draws and animates the stack.
 * Right for a post, which is a thing you look at and come back from.
 *
 * `slide: false` is an ordinary page: it renders in the shell's page slot and cross-fades
 * like any other route, because `slideRouteFor` — which is what all three of those
 * behaviours key off — resolves only the sliding ones. Right for a settings screen, which
 * is a place you go rather than something you peek at. It gets the URL mechanism and none
 * of the overlay semantics. */
export const RUNTIME_ROUTES = [
    { prefix: ROUTES.POST, slide: true, base: ROUTES.DEFAULT },
    /* No dynamic segment on this one — the resolver simply reports a null `param`, which the
     * surface ignores. A runtime route is a way of resolving a URL, not a shape of URL. */
    { prefix: ROUTES.NOTIFICATIONS, slide: true, base: ROUTES.DEFAULT },
    /* The first `slide: false` route, and the shape the split was wired for. A rota is a
     * *place* — reached from a list, from a notification, from a link somebody sent — rather
     * than something you peek at over the feed and come back from, so it cross-fades into the
     * page slot like any other route instead of sliding over one. `base` is meaningless without
     * a surface underneath and is therefore absent. */
    { prefix: ROUTES.SIGNUP, slide: false },
    /* A thread slides in over the inbox, exactly the push-navigation a phone's own
     * messages app performs — and the id is a cuid, so it could never be a page file
     * anyway. `base` makes a cold deep link (a tapped push banner) dismiss to the
     * inbox rather than to the feed.
     *
     * `inline` is the third presentation, and the first route to need it: **above the
     * breakpoint this is not an overlay at all.** A desktop has room to show the list
     * and the thread at once, so the URL selects which conversation the inbox's right
     * half holds rather than opening anything over it. The surface therefore draws
     * nothing on a desktop and <MessagesList/> reads the id straight off the pathname;
     * what this flag changes is the *cold load*, where nothing is mounted underneath
     * and <SlidePage/> would otherwise portal a surface to `document.body`, outside the
     * shell's page slot and every layout it provides. */
    { prefix: ROUTES.CONVERSATION, slide: true, inline: true, base: ROUTES.INBOX },
]

/* Route trees that collapse to a single top-level page-transition key.
 *
 * `/settings` and `/group` are here because a nested layout underneath runs its own
 * `<PageTransition/>` for its sub-routes. `/events` is here for the same *effect* by a different
 * route: a rota is `/events/s/:sheetId`, and it is a level inside the Events surface rather than
 * a page of its own — the header and the tab bar stay put and only the sign-ups panel changes,
 * which it fades itself. Without the collapse the shell would cross-fade the whole screen on the
 * way into a rota, which is the tell that a place has been mistaken for a destination. */
export const NESTED_TRANSITION_ROUTES = [ROUTES.SETTINGS, ROUTES.GROUP, ROUTES.EVENTS]

/* Routes that take the whole area beside the nav rail on a desktop, rather than sitting in
 * the shell's reading column.
 *
 * Every other page in the app is a column of content with a measure — a feed, a list, a
 * form — so the shell gives them all one gutter, one maximum width and one run-in from the
 * top, and no page has to think about it. A messages surface is the other kind: two panes
 * that divide the space between them, one of which wants to be flush against the rail and
 * the other of which should keep growing on a wide monitor. Cancelling the shell's own
 * padding from inside a page means negative margins that have to track it, so the shell is
 * told instead.
 *
 * **Desktop only.** On a phone the inbox is an ordinary column like everything else, so
 * this only ever drops the `md:` half of those classes. */
export const FULL_BLEED_ROUTES = [ROUTES.INBOX]

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
    /* The app's feature flags, read from Firebase Remote Config. The one endpoint that asks
     * for no session, because one of the things it carries is the version floor — a kill
     * switch only a client healthy enough to authenticate could read would be unreachable in
     * exactly the case it exists for. Nothing viewer-scoped may ride here. */
    CONFIG: "/config",
    /* The store reviewer's fixed-code sign-in. 404s unless REVIEW_EMAIL/REVIEW_OTP are set
     * on the server, which is the normal state — see src/app/api/auth/review/route.api.js. */
    AUTH_REVIEW: "/auth/review",
    ME_ONBOARDING: "/me/onboarding",
    /* Is this @handle free? Answered live while the viewer types one during orientation,
     * so a collision surfaces on the step that caused it rather than after the last one. */
    ME_HANDLE: "/me/onboarding/handle",
    /* Somebody else's profile, and the two lists hanging off it. Keyed by @handle for the
     * same reason `/u/:handle` is: it is the identifier the reader tapped. Every one of these
     * is scoped by `visibleProfile` — you may read a person you share an APPROVED group with,
     * and nobody else, so this is not a directory of everyone in the system. */
    PROFILE: (handle) => `/profiles/${handle}`,
    PROFILE_FOLLOW: (handle) => `/profiles/${handle}/follow`,
    PROFILE_FOLLOWERS: (handle) => `/profiles/${handle}/followers`,
    PROFILE_FOLLOWING: (handle) => `/profiles/${handle}/following`,
    /* GET for the viewer's own groups; POST to create one, which only a platform OWNER may
     * do. Never a directory of every group in the system. */
    ORGS: "/orgs",
    /* PATCH the group's own name, bio and picture, for an admin of it; DELETE it, for the
     * owner who created it. There is no GET here: a viewer's groups already arrive with the
     * viewer from /me, and a second endpoint returning the same row would be a second thing
     * to go stale. */
    ORG: (orgId) => `/orgs/${orgId}`,
    ORG_MEMBERS: (orgId) => `/orgs/${orgId}/members`,
    ORG_INVITES: (orgId) => `/orgs/${orgId}/invites`,
    MEMBERSHIP: (membershipId) => `/memberships/${membershipId}`,
    FEED: "/feed",
    /* Where the client asks for permission to upload a file. Answers with a short-lived
     * signed upload URL, which the browser then sends the bytes to directly — see
     * `lib/store/uploads/store.js`. */
    UPLOADS: "/uploads",
    /* Collection root — POST here to publish (admin only). */
    POSTS: "/posts",
    /* GET for detail; DELETE to remove it (admin of the post's group). */
    POST: (postId) => `/posts/${postId}`,
    POST_COMMENTS: (postId) => `/posts/${postId}/comments`,
    POST_LIKES: (postId) => `/posts/${postId}/likes`,
    /* DELETE only — the author's own comment, or anyone's for an admin of the group. */
    COMMENT: (commentId) => `/comments/${commentId}`,
    COMMENT_LIKES: (commentId) => `/comments/${commentId}/likes`,
    /* The panel behind the bell. Three endpoints rather than one because the tally is
     * wanted on every boot and the list only when somebody opens the panel — see the
     * header of `app/api/notifications/unread/route.api.js`. */
    NOTIFICATIONS: "/notifications",
    NOTIFICATIONS_UNREAD: "/notifications/unread",
    NOTIFICATIONS_READ: "/notifications/read",
    /* This installation's FCM token: POST to attach it to the viewer, DELETE on sign-out to
     * detach it. Write-only — there is no GET, because listing somebody's tokens would hand
     * out the values needed to push to their phones. */
    DEVICES: "/devices",
    /* Today's reading, or `?date=YYYY-MM-DD` for another day. The client sends its own
     * local date so the reading turns over at the reader's midnight, not the server's. */
    PROLOGUE: "/prologue",
    /* One day's fasting rule, without the reading around it — `?date=YYYY-MM-DD`. Split out
     * for the sign-up sheets that show it (`showFasting`), which ask about a date somebody is
     * about to take rather than about today. */
    FASTING: "/fasting",
    /* The compiled calendar for one group and one window: the parish's own events, read out
     * of its Google Calendar, and its sign-up slots, in one collection. **One endpoint rather
     * than two**, because the month grid needs both before it can draw a single square, and
     * two requests would mean two skeletons and a grid that fills in twice. */
    EVENTS: "/events",
    /* GET the group's sign-up sheets (`?orgId=`); POST to publish one, which only an admin
     * may do. */
    SIGNUPS: "/signups",
    /* GET one sheet with its slots and who is in them; PATCH its title, description or
     * status; DELETE it. */
    SIGNUP: (sheetId) => `/signups/${sheetId}`,
    /* POST more dates onto an existing sheet — the same generator the sheet was created
     * with, run again. A rota that runs out of Sundays is extended, not replaced. */
    SIGNUP_SLOTS: (sheetId) => `/signups/${sheetId}/slots`,
    /* PATCH one slot's capacity, note, or cancellation; DELETE one nobody has taken. */
    SLOT: (slotId) => `/slots/${slotId}`,
    /* POST to take a spot in this slot. Not a toggle like a like: taking one carries a body
     * (who you are standing for, whether to remind you) and giving one up does not, so they
     * are a POST and a DELETE rather than one endpoint answering both. */
    SLOT_CLAIMS: (slotId) => `/slots/${slotId}/claims`,
    /* DELETE — give up your own spot, or, for an admin of the group, take somebody off a
     * slot they can no longer make. */
    CLAIM: (claimId) => `/claims/${claimId}`,
    /* Direct messages. Every one of these serves ciphertext or the metadata around it —
     * the server never holds a message's text; see `lib/server/messages.service.js` and
     * the schema's "Direct messages" section. All are refused for a viewer under 18. */
    MESSAGE_KEYS: "/messages/keys",
    /* Prekey bundles for every device of one person — what starting a session needs. */
    MESSAGE_BUNDLES: (profileId) => `/messages/keys/${profileId}`,
    /* GET the inbox (`?deviceId=` names which install's envelopes ride along); POST to
     * open (or find) the 1:1 thread with `{ profileId }`. */
    CONVERSATIONS: "/messages/conversations",
    /* GET one thread and a page of its envelopes; DELETE to discard it (a request). */
    CONVERSATION: (conversationId) => `/messages/conversations/${conversationId}`,
    CONVERSATION_MESSAGES: (conversationId) =>
        `/messages/conversations/${conversationId}/messages`,
    CONVERSATION_READ: (conversationId) => `/messages/conversations/${conversationId}/read`,
    CONVERSATION_ACCEPT: (conversationId) =>
        `/messages/conversations/${conversationId}/accept`,
    CONVERSATION_BLOCK: (conversationId) =>
        `/messages/conversations/${conversationId}/block`,
    /* Who the New Message sheet may name — shared-group adults with a registered device. */
    MESSAGE_CONTACTS: "/messages/contacts",
}

/* How many items a page pulls, per collection. The server clamps to its own maximum. */
export const PAGE_SIZE = {
    FEED: 5,
    COMMENTS: 8,
    /* Comfortably more than the desktop popover shows at once, so the first page fills it
     * and the reader has something to scroll before the next one is asked for. */
    NOTIFICATIONS: 15,
    /* A follow row is one line, so a page has to overfill the modal it is read in for the
     * scroll that fetches the next one to exist at all. */
    FOLLOWS: 20,
    /* Sheets are collapsed accordions, so a page of them is a page of single lines — and a
     * parish runs a handful of rotas, not a feed of them. This is deliberately more than any
     * parish will have, so the second page is a contract that exists rather than a thing
     * anybody reaches. */
    SIGNUPS: 20,
    /* A phone-height thread is a couple dozen bubbles; one page covers the screen and a
     * scroll's worth above it, so paging up is for genuinely old history. */
    MESSAGES: 50,
}

/* How often a client push cannot reach re-checks the notification tally — see
 * `useNotificationsWatch` for which clients those are. Short enough that a dot still feels
 * like it appeared on its own; affordable because a tick with nothing to report costs the
 * viewer lookup every request pays plus one index-only count. */
export const NOTIFICATIONS_POLL_MS = 30_000

/* How often an *open* messages surface re-asks the server — the inbox list, and the one
 * thread on screen. Tighter than the notification poll because a conversation is a
 * back-and-forth: ten seconds is the difference between chat and correspondence. Only
 * while the surface is mounted; the background cost of messaging stays zero, since the
 * badge rides the notifications tick. */
export const MESSAGES_POLL_MS = 10_000

/* ---------------------------------------------------------------------------
 * The Daily Read
 * ------------------------------------------------------------------------- */

/* Which English the day's appointed scripture is printed in.
 *
 * **The list is orthocal.info's, not ours.** Its API accepts exactly these three values and
 * rejects anything else with a 422, so this is a mirror of somebody else's enum rather than a
 * menu we composed — adding a fourth here would produce a setting that cannot be served. The
 * `value` is sent verbatim as the `translation` query parameter.
 *
 * The labels are what a parishioner would call each one. The Septuagint reading is the
 * LXX2012 / World English Bible text, which is the Old Testament the Orthodox Church actually
 * appoints; upstream names the parameter after the edition, and nobody choosing a Bible thinks
 * of it as "lxx2012-web". */
export const READING_TRANSLATIONS = [
    { value: "lxx2012-web", label: "Septuagint" },
    { value: "kjv", label: "King James" },
    { value: "douay-rheims", label: "Douay-Rheims" },
]

/* What a reader who has never opened the setting sees. The Septuagint is the Old Testament the
 * Church appoints, which makes it the right thing to print without being asked.
 *
 * `prologue.service.js` falls back to this same value for a request that names no translation,
 * so a client that has not sent one and the server agree on what it is reading. Change one,
 * change the other in the same sitting. */
export const DEFAULT_TRANSLATION = READING_TRANSLATIONS[0].value

/* ---------------------------------------------------------------------------
 * Uploads
 *
 * Shared by both halves on purpose — the picker enforces these so a file that cannot
 * possibly be accepted is rejected before a byte leaves the device, and
 * `lib/server/uploads.service.js` enforces them again because the client is not a
 * control. Unlike ERROR_CODES these are one object read from both sides rather than two
 * copies, because there is nothing here the wire needs to keep stable independently.
 * ------------------------------------------------------------------------- */

/* What a file is being uploaded *for*, which is what decides where it lands and who may
 * ask. A purpose rather than a caller-supplied path: a client that named its own path
 * could write into another group's folder, or overwrite an existing object. */
export const UPLOAD_PURPOSES = {
    /* A photo on a post. Requires ADMIN of the target group, and lands under it. */
    POST_MEDIA: "POST_MEDIA",
    /* The viewer's own profile picture. Requires nothing beyond being signed in. */
    AVATAR: "AVATAR",
    /* A group's picture. Requires ADMIN of that group, and so takes an `orgId` — the same
     * permission as publishing into it, because it is equally the group's public face. */
    ORG_AVATAR: "ORG_AVATAR",
}

/* Ceilings on what an admin may type into the group form.
 *
 * Enforced on the server (`updateOrg`) and mirrored into the form so the counter and the
 * refusal agree. Generous rather than tight: "Cathedral of the Holy Virgin Protection —
 * Diocese of the West" is a real parish name and nothing here should have an opinion about
 * how long a parish's name is allowed to be. */
export const MAX_ORG_NAME_LENGTH = 80
export const MAX_ORG_BIO_LENGTH = 280

/* A group's slug: URL-safe, lowercase, and permanent.
 *
 * Set once when the group is created (`createOrg` derives it from the name unless one is
 * given) and never editable afterwards — it is the natural key the seeds upsert on and the
 * only stable handle anything outside the database has on a group. The shape is the same
 * family as `HANDLE_PATTERN`: it must start and end alphanumeric, so a slug can never render
 * as a leading dash or collide with a path segment. */
export const ORG_SLUG_MIN = 3
export const ORG_SLUG_MAX = 48
export const ORG_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/

/* What the file picker accepts and the server admits.
 *
 * HEIC is on the list because that is what an iPhone hands over, and it is *not* a problem
 * for the canvas re-encode on iOS (WebKit decodes it) — on Android the picker never
 * produces one. Everything is re-encoded to WebP client-side before it is sent, so the mime
 * type that actually reaches storage is almost always `image/webp`; the rest of the list is
 * what the re-encoder is allowed to read. */
export const IMAGE_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
]

/* What a post may carry as an *attachment* — the sign-up sheet, the schedule, the minutes.
 *
 * A short allow-list rather than "anything", because an upload here becomes a public URL that
 * anyone holding it can fetch (see the header of `lib/server/storage.js`): the narrower the
 * set of things that can be put there, the smaller that surface. These are what a parish
 * actually posts. Adding a type means adding it to the bucket too — `npm run storage:setup`
 * carries its own copy, since it runs outside Next and cannot import this file. */
export const DOCUMENT_MIME_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
]

/* The extension an object's key gets, per mime type.
 *
 * Derived from the type rather than taken from the uploader's filename, which is a
 * path-traversal vector — but `application/vnd.openxmlformats-…-document` has no useful tail
 * to split off, so the awkward ones are written down. Cosmetic either way: an object is
 * served with the content type storage recorded, not by its extension. */
export const MIME_EXTENSIONS = {
    "image/jpeg": "jpg",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/plain": "txt",
    "text/csv": "csv",
}

/* The ceiling on a single photo, checked against the file the browser is about to send —
 * i.e. after the re-encode, not before. A 12MP phone photo lands well under this once it has
 * been scaled to IMAGE_MAX_DIMENSION and re-encoded, so hitting it means something is wrong
 * rather than merely large. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/* The ceiling on an attachment. Higher than a photo's because nothing processes it — a
 * document is uploaded exactly as it was picked, and a scanned sign-up sheet is genuinely
 * several megabytes. The bucket enforces the same number, so raising it here alone does
 * nothing; re-run `npm run storage:setup`. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

/* The longest edge a photo is scaled down to before upload. Twice the widest column the app
 * ever renders one in, so it still has a retina's worth of detail, and small enough that a
 * parish on a phone connection is not uploading 6MB per photo. */
export const IMAGE_MAX_DIMENSION = 2048

/* How many photos one post may carry. The carousel is the only thing that renders more than
 * one, and past this a reader is scrolling rather than looking. */
export const MAX_POST_IMAGES = 10

/* **One attachment per post, and this is a contract rather than a preference.**
 * `projectMedia` reads a post's document with `find`, so a second one would be written to the
 * database and then never rendered — silently lost. If a post ever needs several, that
 * projection becomes a list first. */
export const MAX_POST_DOCUMENTS = 1

/* **One video per post, and a post carrying one carries no photos.**
 *
 * Both halves are contracts rather than preferences, and both are for the same reason the line
 * above is: every surface that opens a post is built around *one* media box. <PostModal/>
 * measures a single child to size the dialog to it, <PostSlide/> fills the screen with one
 * thing, and neither has anywhere to put a second. A post published with a video and four
 * photos would therefore store five rows and render one of them, which is the silent loss
 * `MAX_POST_DOCUMENTS` exists to prevent, twice over.
 *
 * An attachment is the exception and stays allowed beside a video: it is not media, it is a row
 * under the media, and it is already drawn there. */
export const MAX_POST_VIDEOS = 1

/* How many digits the emailed sign-in code has.
 *
 * **This is a project setting, not a constant of nature — and the two must agree.** Supabase
 * exposes it under Authentication → Sign In / Providers → Email → Email OTP Length. A new
 * project defaults to **8**, not the six most documentation assumes; this one is set to 6
 * deliberately, because six digits is what people expect to retype and what every other app
 * has trained them on. If you change it in the dashboard, change it here in the same sitting:
 * a mismatch is how the login form went silently unusable once already, `maxLength`
 * truncating the real code and validation then rejecting what was left.
 *
 * Used for the placeholder, the on-screen copy, and the slot grouping. Validation is
 * deliberately looser (see the login page) so a dashboard change cannot lock anyone out
 * before someone remembers to come here. */
export const OTP_LENGTH = 6

/* How long Supabase makes a user wait between OTP requests for the same address. Its
 * `/auth/v1/otp` endpoint enforces a 60-second window and rejects anything inside it, so
 * the login screen's resend affordance counts this down rather than firing into a
 * guaranteed error. Configurable in the dashboard under Authentication → Rate Limits; if
 * you change it there, change it here. */
export const OTP_RESEND_SECONDS = 60

/* ---------------------------------------------------------------------------
 * Events and sign-ups
 *
 * Read from both sides, like the upload limits above: the create form enforces these so a
 * sheet that could not be accepted is refused while it is being typed, and
 * `lib/server/signups.service.js` enforces them again because the client is not a control.
 * ------------------------------------------------------------------------- */

/* Whether a sheet is still taking volunteers. Mirrors the `SignupStatus` enum. Closing is not
 * deleting: a closed rota still says who did what, which is most of the reason a parish keeps
 * one. */
export const SIGNUP_STATUS = {
    OPEN: "OPEN",
    CLOSED: "CLOSED",
}

/* How an admin describes the dates a sheet covers. Two shapes, and between them they cover
 * every rota a parish actually runs:
 *
 *   WEEKLY  the same weekday, week after week — coffee hour after every Liturgy, the soup
 *           kitchen every Saturday. The open-ended kind, extended when it runs out.
 *   DATES   one span of consecutive days — the festival's parking lot over one weekend.
 *
 * Both then take the same time window and the same optional split, which is what makes six
 * two-hour shifts from 4pm to 10pm the *same* form as one 11am-to-12:30 slot rather than a
 * second mode of it. */
export const SIGNUP_PATTERNS = {
    WEEKLY: "WEEKLY",
    DATES: "DATES",
}

/* How far ahead of a shift somebody is reminded. Two nudges, and the pair is the point: the
 * week is when you can still find a replacement, and the day is when you actually put it in
 * your bag. One of either alone fails a different half of the parish.
 *
 * Milliseconds because that is what the arithmetic wants (`startsAt - offset`), and because
 * days are not a unit that survives a daylight-saving boundary intact — a reminder an hour
 * out on the Sunday the clocks change is nobody's problem, and pretending otherwise would
 * cost a timezone conversion per claim.
 *
 * Changing these re-schedules nothing that already exists: the rows are written at claim time
 * from these numbers, so a re-tune reaches only sign-ups made after it. That is the same
 * trade `src/lib/rank.js` documents, and it is accepted for the same reason — the alternative
 * is a nightly job rewriting rows nobody asked it to touch. */
export const SIGNUP_REMINDER_OFFSETS = [
    7 * 24 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
]

/* How long a sign-up sheet's title and description may be. The title has to fit an accordion
 * header on a phone; the description is one paragraph of instructions, not a document. */
export const MAX_SIGNUP_TITLE_LENGTH = 80
export const MAX_SIGNUP_DESCRIPTION_LENGTH = 500

/* An admin's word about one date ("Bring bread, not a full meal"), and a volunteer's about
 * their own spot ("I will bring the coffee"). Short on purpose: a slot row shows this in
 * full, so anything longer would turn a list of dates into a wall of text.
 *
 * The body somebody is standing for is shorter still and for the same reason — "OCF -
 * Orthodox Christian Fellowship" is 30 characters and is about as long as a name that has to
 * sit where a person's name would. */
export const MAX_SLOT_NOTE_LENGTH = 140
export const MAX_CLAIM_NOTE_LENGTH = 140
export const MAX_ON_BEHALF_OF_LENGTH = 60

/* How many people one slot may hold. Four cooks, six pairs of hands on a parking lot; the
 * ceiling is here to catch a typed 400, not to express a rule about parishes. */
export const MAX_SLOT_CAPACITY = 99

/* How many dates one run of the generator may write, and how many a sheet may hold in total.
 *
 * The first is what stops "every Sunday" from meaning "every Sunday until the heat death of
 * the universe" — a year of weekly slots is 52, and six two-hour shifts across a fortnight is
 * 84, so 120 admits every real rota and refuses the runaway. The second is the ceiling that
 * matters, because the generator can be run again: a sheet extended once a year forever is
 * still a sheet somebody has to scroll. */
export const MAX_GENERATED_SLOTS = 120
export const MAX_SHEET_SLOTS = 520

/* How far ahead an **ongoing** rota keeps dates open.
 *
 * Eight weeks is the span a parish plans in: far enough that somebody can see the Saturday
 * they will be away for and take a different one, short enough that a rota nobody is watching
 * has not written a year of rows nobody wanted. It is a horizon rather than a total — the rota
 * is topped back up to it whenever it is read, so it never runs out. */
export const SIGNUP_HORIZON_DAYS = 56

/* The longest a generated shift may be, and the shortest. A slot is a shift somebody stands
 * for, so a 24-hour one is a mistake in the form rather than a rota, and a 5-minute one is a
 * split length typed into the wrong box. */
export const MIN_SLOT_MINUTES = 15
export const MAX_SLOT_HOURS = 14

/* How wide a window the calendar endpoint will expand at once.
 *
 * The month grid asks for the six weeks it draws, so this is generous rather than tight — but
 * it is a real ceiling, because the window is what bounds the recurrence expansion of a feed
 * this app does not control. A year of a daily event is 365 rows; ten years of one is a
 * response nobody asked for. */
export const MAX_CALENDAR_DAYS = 120

/* What the two kinds of entry on the compiled calendar are called on the wire.
 *
 * The one thing a square on the grid has to know about an entry is which of these it is,
 * because that is what the ring's colour means. Everything else about the two shapes differs
 * — a parish event has a location and no capacity, a slot has capacity and no location — and
 * that is why they are one collection with a discriminator rather than two collections the
 * client would have to merge and re-sort itself. */
export const CALENDAR_ENTRY = {
    /* From the group's own Google Calendar, read as an iCalendar feed. Read-only, always. */
    PARISH: "PARISH",
    /* A slot on one of the group's sign-up sheets. */
    SIGNUP: "SIGNUP",
}

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

/* Authority over the platform, not over a group — the subscriber's axis. Mirrors the
 * `PlatformRole` enum.
 *
 * **Presentation only, like every role constant here.** It decides whether the switcher
 * offers "New group"; `requirePlatformOwner` on the server is what actually decides, and a
 * client that lied about this would get a 403. It is deliberately not part of `ROLE_LEVEL` —
 * OWNER is not a rank above ADMIN, it is a different question, and putting it on that ladder
 * would make `<Privileged/>` start answering it. */
export const PLATFORM_ROLES = {
    NONE: "NONE",
    OWNER: "OWNER",
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
 * **This is the only place a title is written down, and it reaches exactly one caller:**
 * `suggestDisplayName()` in `lib/name.js`, which prefills the display-name field. Nothing
 * renders a title — how somebody is addressed is `Profile.displayName`, which they type.
 *
 * Absent (CATECHUMEN, FAITHFUL) means no title, which is not the same as an empty string:
 * the suggestion branches on whether one exists to decide between "Dn. Paul" and "Jordan
 * Rivera".
 *
 * The backfill in `20260903160000_display_name` writes these same strings in SQL, and the
 * two have to agree — a title changed here without changing there renames nobody, but a
 * parish seeded after the change would disagree with one seeded before it.
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

/* Who is asked for an ordination date — at orientation, and in Settings.
 *
 * **The three ordained ranks, and deliberately not READER.** A reader is *tonsured*, not
 * ordained, and a matushka is not clergy at all; asking either for the date of an ordination
 * they never had is asking a question with no true answer. It is a presentation rule and not
 * a permission — `updateProfile` accepts the field from anybody, because a reader ordained a
 * deacon next month must not have to wait for a deploy to record it.
 *
 * Read as a Set at the call sites; a list here so it reads in ecclesiastical order like every
 * other vocation constant. */
export const CLERGY_VOCATIONS = [VOCATIONS.DEACON, VOCATIONS.PRIEST, VOCATIONS.BISHOP]

/* The ranks a name is **conferred** with — who is asked for a patron saint, and whose
 * display-name suggestion is built from it rather than from their first name.
 *
 * A reader is tonsured to one, a deacon and a priest are ordained, a monk is tonsured again
 * and a bishop consecrated again — and each of those hands the man the name he is thereafter
 * called by, which is why "Priest Robert" names somebody nobody in the parish knows.
 *
 * It is also who is shown the display-name field at all. Everyone else is called what their
 * name is, so there is nothing for them to decide.
 *
 * **A separate list from `CLERGY_VOCATIONS`, not a superset to fold into it.** That one
 * answers "who was ordained", which decides whether orientation asks for a date and which
 * deliberately excludes a reader. This answers "whose name changed", which includes him. The
 * two happen to differ by one entry today; merging them would make the next divergence a bug.
 *
 * MATUSHKA is absent: her title comes from her husband's ordination rather than from anything
 * conferred on her, so nothing has renamed her. */
export const RANKED_VOCATIONS = [
    VOCATIONS.READER,
    VOCATIONS.DEACON,
    VOCATIONS.PRIEST,
    VOCATIONS.BISHOP,
]

/* Month names, spelled out, for the name-day control and anything else that prints a month.
 *
 * Not `toLocaleDateString`: the app prerenders to static HTML, and a locale-formatted month is
 * one of the few things that reliably differs between the build machine and the reader's
 * browser — which is a hydration mismatch on a control nobody has touched. */
export const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

/* How long a patron saint may be. Generous because the value is the saint as the Church
 * writes him — "The Right-Believing Prince Alexander Nevsky" is 42 characters and is not an
 * outlier. The only failures worth catching are empty and absurd. */
/* A direct message's plaintext ceiling, enforced client-side before encryption — the
 * server sees only ciphertext and cannot count characters, which is why it bounds the
 * *envelope* instead (below). Generous for a chat message; a sermon is a post. */
export const MAX_MESSAGE_LENGTH = 2000

/* The server's bound on one encrypted envelope. Sized for MAX_MESSAGE_LENGTH's worst
 * case (4-byte characters, CBC padding, base64, the prekey handshake riding along)
 * with slack, so it only ever rejects something no honest client produced. */
export const MAX_ENVELOPE_BYTES = 24000

export const MAX_PATRON_SAINT_LENGTH = 80

/* How long a display name may be, and it is deliberately far shorter than the patron saint
 * above. This is the string that has to fit a byline, a follower row and a push banner's
 * title, and the reason the field exists is that a full hagiographic title does not — so a
 * ceiling that would admit one back would give up the thing that was bought. */
export const MAX_DISPLAY_NAME_LENGTH = 40

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
    /* A feature switched off for this deployment. Never shown to anybody — see
     * `SILENT_ERROR_CODES` below. */
    FEATURE_DISABLED: "FEATURE_DISABLED",
    NETWORK: "NETWORK",
}

/* Codes `toErrorList` refuses to turn into anything a reader sees.
 *
 * A toast answers a question somebody asked. Nobody asked for a feature to be switched off:
 * the flag takes the entrance and the surface with it, so the only requests that can be
 * refused this way are the one that raced the flag on boot and a crafted one. Both should
 * leave the app looking exactly as it does when the feature was never there. */
export const SILENT_ERROR_CODES = new Set([ERROR_CODES.FEATURE_DISABLED])
