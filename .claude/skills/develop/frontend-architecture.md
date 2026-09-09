# Frontend Architecture

This document describes the frontend architecture and the patterns ALL agents must follow. The frontend is the entire project — the app is rooted at the repo top level (single npm package). Follow these rules completely and do **not** take creative liberties outside their scope.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | **Next.js 15** (App Router) on **React 19** |
| Build / Dev Server | **Next.js** (`next dev` / `next build` / `next start`) |
| Rendering model | **Client-rendered SPA inside Next.** Pages/layouts are Client Components (`"use client"`); the stores, `motion`, and the Supabase session run entirely on the client. Next exists here for the Node server that hosts `/api`, not for SSR/RSC data fetching. |
| Routing | **Next.js App Router** (`src/app/**`, file-based) + `next/navigation` + `next/link` |
| State Management | **Zustand 5** + **Immer** middleware |
| Forms | `react-hook-form` + `zod` (via `@hookform/resolvers`) |
| Styling | **Tailwind CSS v4** (via `@tailwindcss/postcss`) |
| Animation | `motion` (Framer Motion) |
| Theming | **`next-themes`** (class strategy, `storageKey` `grapevine-ui-theme`) |
| Auth | **Supabase Auth** (emailed one-time code, browser client) — gates in `components/AuthGate.jsx`, role gating in `components/Auth.jsx` |
| Native shell | **Capacitor 8** (iOS + Android) over a static export — see `native-architecture.md` |
| Component Library | **shadcn/ui** (radix-ui primitives) — `components.json` at the repo root |
| Icons | **Google Material Symbols** via the local `<Icon>` component |
| SVG | **`@svgr/webpack`** (configured in `next.config.mjs`) — SVGs are imported as React components |
| Toasts | `sonner` |
| Drawers | `vaul` (wrapped by shadcn `drawer`) |
| Class Merging | `clsx` + `tailwind-merge` (re-exported as `cn()` in `@/lib/utils`) |
| Database | **Postgres on Supabase** via **Prisma** — `prisma/schema.prisma`, client singleton `src/lib/db.js`, reached only from `src/lib/server/**` |

Reference files:

- `package.json` — dependency list
- `next.config.mjs` — Next config (SVGR via `@svgr/webpack` for both webpack and Turbopack; optional `basePath` from `NEXT_PUBLIC_BASE_PATH`; `output: "export"` when `NEXT_PUBLIC_NATIVE=1`)
- `capacitor.config.json` — native app id/name, `webDir: "out"`, plugin options
- `postcss.config.mjs` — Tailwind v4 via `@tailwindcss/postcss`
- `jsconfig.json` — `@/*` → `./src/*` alias (Next reads this for path resolution)
- `components.json` — shadcn config

---

## Formatting Rules

- **Indentation:** 4 spaces, UTF-8, LF line endings.
- File naming: components in PascalCase (`Drawer.jsx`); App Router segments use Next's reserved lowercase filenames — `page.jsx`, `layout.jsx` — inside the directory that names the route (`app/(protected)/apps/[app]/page.jsx`).
- **Client Components:** any file that uses hooks, `motion`, browser APIs, Zustand, or event handlers must start with `"use client"`. Pages/layouts here almost always need it. Purely static pages (no hooks) may stay Server Components — but the `children` of a client layout can still be a Server Component, so only add the directive where a file itself uses client features.
- Path alias: `@` resolves to `./src`. Use `import x from '@/...'` everywhere — never relative paths like `../../`.

---

## Project Structure

```
├── src/
│   ├── app/                         # Next.js App Router — routes are folders
│   │   ├── layout.jsx               # Root layout: <html>/<body>, globals.css, viewport/metadata,
│   │   │                            #   the native boot guard; renders <Providers> + <App/>
│   │   ├── providers.jsx            # "use client": next-themes ThemeProvider + Scroll + <Toaster/>
│   │   ├── App.jsx                  # "use client", renders null: initAuthorizedStores + useErrorListener
│   │   ├── (public)/                # Route group (no URL segment) — unauthenticated
│   │   │   ├── layout.jsx           # <PublicGate> + <Grain/> + <PageTransition/>
│   │   │   └── login/page.jsx       # /login
│   │   └── (protected)/             # Route group — authenticated shell
│   │       ├── layout.jsx           # Nav + topbar + top-level <PageTransition/> around {children}
│   │       ├── page.jsx             # Dashboard (/)
│   │       ├── connect/page.jsx     # /connect
│   │       ├── credentials/page.jsx # /credentials
│   │       ├── settings/
│   │       │   ├── layout.jsx       # Shared frame + NESTED <PageTransition/> for sub-pages
│   │       │   ├── page.jsx         # /settings — the account surface AND the tree's index
│   │       │   ├── about/page.jsx   # /settings/about — the build, and who made it
│   │       │   ├── general/page.jsx # /settings/general
│   │       │   └── info/page.jsx    # /settings/info — the viewer's own details
│   │       ├── events/page.jsx      # /events — the parish's calendar and its sign-up sheets
│   │       ├── group/               # admin-only tree: index, info/, users/, events/
│   │       │                        #   (gated once in its layout)
│   │       └── [...not-found]/page.jsx  # Catch-all → in-shell 404 (old `path: '*'`)
│   ├── globals.css                  # Tailwind v4 + theme tokens (only file to change theme vars)
│   ├── assets/
│   │   ├── fonts/
│   │   └── svg/                     # ALL svgs live here; imported as React components
│   │       └── icons/               # Sidebar/utility icons (still SVG, not Material)
│   ├── components/
│   │   ├── ui/                      # shadcn primitives — maintainer's; agents: read-only
│   │   ├── Icon.jsx                 # Google Material Symbol wrapper
│   │   ├── Transition.jsx           # motion.div fade wrapper for AnimatePresence (skeleton/content swaps)
│   │   ├── PageTransition.jsx       # "use client": route cross-fade (AnimatePresence + FrozenRouter)
│   │   ├── FrozenRouter.jsx         # "use client": freezes LayoutRouterContext for exiting routes
│   │   ├── SlideRouter.jsx          # "use client": the slide-route surface registry —
│   │   │                            #   <SlideRouter/> (in-app overlay), <SlidePage/> (cold
│   │   │                            #   load, portals to <body>), <SlideBase/> (the pushed base)
│   │   ├── SlideSurface.jsx         # "use client": the full-screen sheet a slide route takes
│   │   │                            #   on a phone — box, safe area, keyboard lift, enter/exit
│   │   ├── Loading.jsx              # <Spinner/> — no full-screen loading surface; the gates render nothing
│   │   ├── Skeleton.jsx             # Skeleton primitive + named skeleton components
│   │   ├── Badge.jsx                # Branded badge; hashes color from text
│   │   ├── Img.jsx                  # "use client": every photo the app draws — fades in on
│   │   │                            #   load, paints at once when the browser already has it
│   │   ├── Hyperlink.jsx
│   │   ├── Hint.jsx                 # "use client": a sentence over whatever it wraps — hover on
│   │   │                            #   a fine pointer, tap on touch; the app has no tooltips
│   │   ├── Linkify.jsx              # Author text with its URLs live — the only link out of the app
│   │   ├── Breadcrumb.jsx
│   │   ├── Notifications.jsx
│   │   ├── Profile.jsx
│   │   ├── Pagination.jsx
│   │   ├── Widgets.jsx              # Reusable misc/branded widgets (e.g. <Close/>, <YayOrNay/>) — DRY home, never repeat misc components in pages
│   │   └── Grain.jsx
│   ├── lib/
│   │   ├── api.js                   # API wrapper + ApiError — the only layer that fetches
│   │   ├── constants.js             # ROUTES, RUNTIME_ROUTES, NESTED_TRANSITION_ROUTES,
│   │   │                            #   API_BASE / API_ENDPOINTS / PAGE_SIZE / ERROR_CODES, MOCK_*_MS
│   │   ├── mock.js                  # mockDelay / mockId — the `app` store's skeleton floor + temp ids
│   │   ├── utils.js                 # Shared pure helpers (cn, formatDate, appPath/basePath,
│   │   │                            #   toErrorList, route resolvers: slideRouteFor/baseRouteFor/…)
│   │   ├── supabase.js              # Browser Supabase client + accessToken()
│   │   ├── db.js                    # Prisma client singleton — wired, unused
│   │   ├── server/                  # server-only; see backend-architecture.md
│   │   │   ├── errors.js            # ERROR_CODES/ERROR_STATUS registry + AppError
│   │   │   ├── handler.js           # route() wrapper + pageParams()
│   │   │   ├── respond.js           # sendResource / sendCreated / sendCollection / sendNoContent
│   │   │   ├── cursor.js            # opaque cursor encode/decode + paginate
│   │   │   ├── posts.service.js     # business logic — the seam Prisma replaces
│   │   │   └── projections.js       # database rows → wire shapes
│   │   ├── hooks/                   # Cross-cutting React hooks (not Zustand hooks).
│   │   │                            #   Look here before writing one — a useState(false) +
│   │   │                            #   useEffect setTrue is useMounted; viewport is
│   │   │                            #   useIsDesktop; layout effect is useIsomorphicLayoutEffect.
│   │   │   ├── useDebounce.hook.jsx
│   │   │   ├── useMounted.hook.js
│   │   │   ├── useIsDesktop.hook.js
│   │   │   ├── useHasHover.hook.js    # can the primary pointer hover — not the breakpoint
│   │   │   ├── useNow.hook.jsx
│   │   │   ├── useSlideRoute.hook.js  # Interceptor ↔ shell bridge for slide routes
│   │   │   ├── useScroll.hook.js      # useVibing + usePullToRefresh (container-targeted)
│   │   │   └── useErrorListener.hook.jsx
│   │   ├── providers/
│   │   │   ├── Theme.jsx            # Thin re-export of next-themes ThemeProvider/useTheme
│   │   │   ├── Scroll.jsx           # shell scroll container ref + scrollToTop (useScroll)
│   │   │   └── index.jsx            # barrel (ThemeProvider, ScrollProvider)
│   │   └── store/                   # Zustand stores (one folder per domain)
│   │       ├── global.store.js      # Orchestrates init/reset/clearErrors across stores
│   │       ├── global.hook.js       # useErrors() aggregator (+ useReady() when stores grow)
│   │       ├── auth/                # { store.js, hook.js }
│   │       ├── app/                 # { store.js, hook.js }
│   │       ├── org/                 # { store.js, hook.js } — the selected group + the switcher
│   │       ├── feed/                # { store.js, hook.js } — the paginated list
│   │       ├── post/                # { store.js, hook.js } — the one open post + all post writes
│   │       ├── comments/            # { store.js, hook.js } — the one open thread
│   │       ├── profile/             # { store.js, hook.js } — the one open profile + every follow write
│   │       ├── follows/             # { store.js, hook.js } — the one open follower/following list
│   │       ├── calendar/            # { store.js, hook.js } — a group's months, cached +
│   │       │                        #   prefetched, and whichever day is open
│   │       ├── signups/             # { store.js, hook.js } — the group's rotas, as summaries
│   │       ├── sheet/               # { store.js, hook.js } — the one open rota + slot writes
│   │       ├── notifications/       # { store.js, hook.js } — the bell's tally + the panel's list
│   │       └── push/                # { store.js, hook.js } — FCM permission + this device's token
└── app/api/**/route.api.js          # the API. `.api.js`, NOT `route.js` — see backend-architecture.md
```

> **Note:** entry wiring lives in `app/layout.jsx` + `app/providers.jsx`, and routing is the App Router `app/**` segments — there is no `main.jsx` or router config file. The `apps/nodes/events` domains referenced elsewhere in this doc are illustrative templates for the store/hook pattern — the stores this repo actually ships are `auth`, `app`, `feed`, and `comments`.

---

## Layered Architecture (HARD RULE)

```
API (lib/api.js + lib/constants.js)
        ▼
Store    (lib/store/<domain>/store.js)        ← the ONLY layer that calls API
        ▼
Hook     (lib/store/<domain>/hook.js)         ← the ONLY layer that calls the store
        ▼
Component / Page                              ← consumes the hook
```

**Non-negotiable rules:**

1. **No API calls outside `store.js`.** Components and `useEffect`s must never call `fetch`/`api.get(...)` directly.
2. **No store usage outside `hook.js`.** Components never call `useXxxStore(...)` directly — they call the matching `useXxx()` hook (e.g. the login page uses `useLogin()`).
3. **Cross-store communication happens inside stores** via `useOtherStore.getState()` (see "Cross-store reads" below). Never wire two stores together inside a component.

---

## API Layer (`lib/api.js`, `lib/constants.js`)

`lib/api.js` is a single static class with `get` / `post` / `put` / `delete`. Any failure —
non-2xx or a request that never completed — is thrown as an **`ApiError`** carrying `code`,
`message`, `fields`, `requestId`, `status`, so a store's `catch` never inspects `res.ok` or
`res.status`. `204` resolves to `null`. Two options: `params` (an object serialized to a
query string) and `raw` (resolve with the `Response` instead of parsed JSON); anything else
is forwarded to `fetch`.

```javascript
const { items, nextCursor } = await api.get(API_ENDPOINTS.FEED, { params: { limit, cursor } })
const result = await api.post(API_ENDPOINTS.POST_LIKES(postId))
```

**The server it talks to is real.** Route handlers live under `src/app/api/**/route.api.js`
and the wire contract — success shapes, the single error shape, the error-code registry,
cursor pagination — is specified in **`backend-architecture.md`**. Read that before adding
an endpoint. Two things from it that bite here:

- **Branch on `error.code`, never `error.message`.** The codes are the stable half of the
  contract, and `ERROR_CODES` in `lib/constants.js` must stay in sync with its twin in
  `lib/server/errors.js`.
- **Every request carries a bearer token.** `lib/api.js` reads the Supabase access token
  per request and sends `Authorization: Bearer …`; a 401 signs the app out. Stores do not
  think about auth at all.
- **No latency floor on anything API-backed.** Reads hit Postgres now, and a warm feed page
  answers in ~0.3s. Stores must **not** race a `mockDelay` floor of their own (see the store
  template below). The one floor left is the `app` store's, which has no endpoint to wait on.

All routes and endpoints live in `lib/constants.js`. Parameterized paths are functions, so
no caller ever builds a URL by hand:

```javascript
export const ROUTES = {
    DEFAULT: "/",
    INBOX: "/inbox",
    POST: "/p",
    PUBLIC: { LOGIN: "/login" },
}

export const API_ENDPOINTS = {
    FEED: "/feed",
    POST: (postId) => `/posts/${postId}`,
    POST_COMMENTS: (postId) => `/posts/${postId}/comments`,
    POST_LIKES: (postId) => `/posts/${postId}/likes`,
    COMMENT_LIKES: (commentId) => `/comments/${commentId}/likes`,
}

/* Same-origin /api in the Node build; the native app must be pointed at a deployed
 * instance by absolute URL, because a static export has no server of its own. */
export const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    `${(process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "")}/api`

export const PAGE_SIZE = { FEED: 5, COMMENTS: 8 }
```

> **Env vars:** under Next, anything read in browser/client code must be prefixed `NEXT_PUBLIC_` and accessed via `process.env.NEXT_PUBLIC_*` (there is no `import.meta.env`). Server-only route handlers may read unprefixed vars.

Never hard-code URLs or paths in stores/components — extend these maps.

---

## State Management — Zustand + Immer

### The store template

Every domain store lives at `lib/store/<domain>/store.js` and follows this exact shape. The keys `ready`, `loading`, `error`, plus the actions `init`, `refresh`, `reset`, `clearErrors`, are required so the global aggregator can talk to it.

```javascript
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import api from '@/lib/api'
import { API_ENDPOINTS, PAGE_SIZE } from '@/lib/constants'
import { toErrorList } from '@/lib/utils'

const ERROR_INIT = {
    list: false,
}

const LOADING_INIT = {
    list: false,
    more: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* Loaded pages, flattened. `cursor` is the opaque continuation token the server handed
     * back for the next page; treat it as a string and never parse it. */
    items: [],
    cursor: null,
    hasMore: true,
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Idempotent boot. Called from the hook on mount; safe to call repeatedly. */
    init: async () => {
        if (get().ready === false && get().loading.list === false) {
            get().refresh()
        }
    },

    refresh: async () => {
        set(state => { state.loading.list = true })
        try {
            /* Collections come back as { items, nextCursor } — always an object, never a
             * bare array, and `nextCursor === null` is the only end-of-collection signal.
             * No `mockDelay` floor here — reads hit the database directly. */
            const { items, nextCursor } = await api.get(API_ENDPOINTS.ITEMS, {
                params: { limit: PAGE_SIZE.ITEMS },
            })
            set(state => {
                state.items = items
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
                state.ready = true
            })
        } catch (error) {
            set(state => {
                state.error.list = toErrorList(error, 'Could not load items.')
            })
        } finally {
            set(state => { state.loading.list = false })
        }
    },

    /* Appends the next page. Guarded so a double-tap or an overlapping refresh can't
     * request the same cursor twice. See "Paginated collections" below. */
    loadMore: async () => {
        const { cursor, hasMore, loading } = get()
        if (!hasMore || !cursor || loading.more || loading.list) return

        set(state => { state.loading.more = true })
        try {
            const { items, nextCursor } = await api.get(API_ENDPOINTS.ITEMS, {
                params: { limit: PAGE_SIZE.ITEMS, cursor },
            })
            set(state => {
                const seen = new Set(state.items.map(item => item.id))
                state.items.push(...items.filter(item => !seen.has(item.id)))
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
            })
        } catch (error) {
            set(state => { state.error.list = toErrorList(error, 'Could not load more.') })
        } finally {
            set(state => { state.loading.more = false })
        }
    },

    /* The list's whole surface area to the store that owns the open item: read one loaded
     * row, or patch one. Nothing outside this store touches `items`. See "Detail as a
     * runtime fetch, in its own store" below — the detail fetch itself does not live here. */
    cachedItem: (id) => get().items.find(item => item.id === id) ?? null,
    patchItem: (id, patch) => set(state => {
        const row = state.items.find(item => item.id === id)
        if (row) Object.assign(row, patch)
    }),

    reset: () => set(state => ({ ...state, ...INIT })),
    clearErrors: () => set(state => ({ ...state, error: ERROR_INIT })),
})))

export default useStore
```

Rules for stores:

- **Always** declare an `INIT` const, spread it at the top of the store, and reuse it inside `reset()`.
- **Always** expose `ready`, `loading`, `error`, plus `init`, `refresh`, `reset`, `clearErrors`. If you don't, the global aggregator and `useErrorListener` will silently drop you.
- Use **Immer**: write mutations as `set(state => { state.x = y })` whenever you can. Plain object replacement (`set(state => ({ ...state, x: y }))`) is allowed for trivial cases and is what older stores use, but new code should prefer Immer.
- When a domain has **multiple loading/error surfaces** (e.g. `nodes` and `installables`), make `loading` and `error` *objects* keyed by the sub-resource (see `lib/store/nodes/store.js`). `useErrorListener` walks them recursively. Even a store with a single primary fetch should keep `loading` (and `error`) as an object so additional resources slot in as `loading.<resource>` later without a refactor.
- **One `ready` per store, not per resource.** `ready` tracks the store's *primary* resource — the boot fetch `init()` gates for a long-lived store, or the on-demand load for a transient one (`post`, `comments`, which have no `init` at all and are re-loaded per id). Do **not** add parallel `xxxReady` flags for secondary resources. A store that needs two independent readiness flags is usually two stores. For a secondary resource's `skeleton`, gate on the *data being empty*: `skeleton = items.length === 0`. Because a loaded list is never empty, emptiness is a reliable "not loaded yet" signal, so the skeleton **paints on the very first frame** and clears once data arrives; a background refetch keeps the list populated, so it never re-flashes. Example: `auth` holds the primary `user` (gated by `ready`) plus a secondary `users` list whose hook (`useAdmin`) exposes `skeleton = users.length === 0`. (If a resource can legitimately be empty when loaded — a post with no comments, a post that 404s — emptiness is not a readiness signal, so set `ready` on **both** the success and failure paths instead — see `lib/store/comments/store.js` and `lib/store/post/store.js`. Forget the failure path and the skeleton spins forever instead of resolving to an empty or not-found state.)
- Use `persist(...)` from `zustand/middleware` **only** for state that must survive a page reload (currently: `auth`). Other stores are in-memory.

### Parallel API calls

When a store action needs **more than one API call**, look for opportunities to run independent requests in parallel with `Promise.all` instead of chaining sequential `await`s. This reduces round trips and speeds up detail loads.

**Only parallelize calls whose inputs do not depend on another call's response.** If call B needs an ID, slug, or other value from call A's result, A must finish first — `Promise.all` cannot help those two calls directly.

```javascript
// BAD — independent calls chained sequentially (three round trips)
const appRes = await api.get(API_ENDPOINTS.APPLICATION_BY_SLUG(slug))
const app = appRes?.data?.[0]
const versionsRes = await api.get(API_ENDPOINTS.APPLICATION_VERSIONS(app.id))
const versionRes = await api.get(API_ENDPOINTS.APPLICATION_VERSION_DETAIL(app.id, version))

// GOOD — resolve slug→id first, then parallelize the rest (two round trips)
const appRes = await api.get(API_ENDPOINTS.APPLICATION_BY_SLUG(slug))
const app = appRes?.data?.[0]
if (!app) throw [`App not found: ${slug}`]

const [versionsRes, versionRes] = await Promise.all([
    api.get(API_ENDPOINTS.APPLICATION_VERSIONS(app.id)),
    api.get(API_ENDPOINTS.APPLICATION_VERSION_DETAIL(app.id, version)),
])
```

Reference: `lib/store/apps/store.js` → `setCurrentVersion`.

Do **not** force parallelization when calls are genuinely dependent (e.g. slug lookup before `application_id`-scoped endpoints). Do **not** parallelize writes that must happen in order unless the backend explicitly supports it.

### Paginated collections

Every collection endpoint returns `{ items, nextCursor }` (see `backend-architecture.md`
§2). Three rules follow from that:

1. **`hasMore` is derived from the cursor, never from a count.** `nextCursor === null` is
   the only end-of-collection signal — there is no total, and asking for one would make the
   server count rows it otherwise never touches.
2. **Never parse the cursor.** It is opaque by contract, which is what lets the server
   switch from offset to keyset pagination without a client change.
3. **`refresh` replaces, `loadMore` appends.** Pull-to-refresh should show the newest page,
   not reconcile against what the reader was already holding. `loadMore` filters ids it
   already holds before pushing, because a refresh can land mid-append and otherwise
   duplicates rows.

Keep a `loading.more` separate from `loading.list`: the first drives a spinner at the foot
of the list, the second drives the whole-surface skeleton. Sharing one flag re-flashes the
skeleton on every page.

### Detail as a runtime fetch, in its own store

**A paginated list and the one open item are two stores, not one.** `feed` owns the list;
`post` owns the open post *and* every write to a post. They have different lifetimes — the
list is long-lived and refreshable, the open post is transient and addressed by id — and the
open post exists in cases the list doesn't (a cold deep link has no feed behind it at all).

The split is what makes the sharing explicit. What the list holds is a **projection** of a
post: the row it paged in. Two actions on `feed` are its whole surface area to the `post`
store, and nothing else may touch `items`:

- **`cachedPost(id)`** — the loaded row, or null. The fast path the open post is seeded from.
- **`patchPost(id, patch)`** — apply a partial to that row, if this page holds it. Every write
  goes through it, because the same post is on screen twice and the copies must agree.

`load` fetches by id — it is **not** a lookup in `items`. With pagination the list only holds
the pages loaded so far, so a cached copy can only ever be a fast path. This is also what
frees ids from build time (`native-architecture.md` → **Dynamic routes at scale**).

The order in `lib/store/post/store.js` → `load` is the whole feature:

1. **Promote the cached row synchronously.** It carries the image the reader just tapped,
   already fetched and decoded by the browser, so the surface paints complete on the first
   frame: no skeleton, no second image request, no flash.
2. **Fetch detail in the background, silently.** There is a full surface on screen already,
   so covering it with a skeleton would be a regression. Only the comment thread loads
   visibly, because there is no cached copy of a thread and it's the part of a post a reader
   expects to be live.
3. **Discard late responses.** Track the requested id (`currentId`) separately from the
   resource (`current`) and bail if they diverge, or a slow response for a post the reader
   already left overwrites the one they're looking at.
4. **Cold load takes the same path.** No cache means step 1 finds nothing, the readiness
   flag stays false, and the surface shows its skeleton until the fetch lands. Same action,
   same endpoint, both ways in.

`signups` / `sheet` are the same split a **third** time, and by now that is the point: `signups`
owns the rotas, `sheet` owns the one the reader expanded and every write to a slot inside it.
The endpoint ships each rota **with its dates**, so `sheet.load` promotes the listed copy
synchronously and refreshes behind it — the same three steps `post.load` takes, so opening an
accordion is not a request. Its arrows out are two and both narrow: `signups.applySlot` replaces
the slot inside its row, and `calendar.patchSlot` moves the ring on the month grid and the block
on the day's timeline. Both exist because the same slot is on screen in more than one place at
once — the calendar tab and the sign-ups tab are two halves of one page, so a Take pressed on one
has to be true on the other the moment the reader flips.

**Nothing on that surface is a stored tally.** "4 dates need people" and "what have I signed up
for" are both counted off the slots in hand (`summarize` in `lib/utils.js`), which is what lets
`applySlot` be the only write the list needs: there is no summary to move by a delta, and no way
for a count to disagree with the dates it is a count of.

**Writes there are deliberately not optimistic**, unlike a like. The last place on a rota goes to
whoever's transaction commits first, and telling somebody they have a place and then taking it
back is worse than a spinner on one button — it is also the failure that matters, because the
person who was told they had a place is the person who does not turn up.

`profile` / `follows` are the same split applied a second time, which is what makes it a
pattern rather than a one-off: `profile` owns the person the open card is about *and* every
follow write in the app, `follows` owns the rows of both lists about them. The dependency runs
one way — `profile` reaches into `follows` through a narrow `patchRow`, and `follows` imports
nothing — so a follow tapped on a card's header and the same follow tapped on a row in its list
cannot disagree.

`follows` holds **a slot per direction and loads both together**, which is a deliberate
departure from "one open collection per store". They are two tabs of one surface that a reader
flips between freely, so loading on tab-switch put a round trip and a skeleton in front of every
flip — for a page of twenty rows. Fetching the pair in parallel on open costs one extra request
and makes every switch after it instant; it is also what lets all three tab panels stay mounted
and cross-fade, which a single shared slot could not survive.

`profile` also shows what step 1 looks like when the cache is not a list. There is no directory
of people to promote a row out of, so the seed is the **viewer** — `/api/me` ships the follow
tallies precisely so `viewerProfile` (in the auth store, beside `viewerAuthor`) can project the
viewer into the exact shape `/api/profiles/:handle` answers. Opening your own card therefore
paints on the first frame and refreshes silently; opening anybody else's finds nothing and pays
its skeleton. Two details make that seed actually invisible, and both were bugs first: the load
runs in a **layout effect** (a `useEffect` fires after paint, so the skeleton is committed for a
frame), and the skeleton is rendered **outside** the card's `<AnimatePresence mode="wait">` (which
plays the exit of whatever child it mounted with, so a skeleton nobody saw still spends 200ms
leaving). The seed is also guarded on the tallies being present, because the auth store persists
the viewer and a session from before they existed rehydrates without them — zeros on screen for a
round trip are worse than a skeleton.

`profile` additionally owns **which card is open** (`openHandle`), on the same grounds the org
store owns `creating`: a handle is tapped from a comment row, a feed byline and the account page,
and those are three separate subtrees. One value in one store, one `<ProfileCard/>` mounted by
the shell.

### Optimistic writes

**Writes to an entity belong to the store that owns the entity, not to the surface that
renders it.** A post's like is tapped from both the feed card and the open overlay, so it
lives in `post` and both surfaces call the same `usePostLike()`. That co-location is what
makes "keep every copy in agreement" enforceable in one place instead of two.

Likes and new comments apply on the current frame and reconcile against the response. The
shape, every time (`toggleLike` in `lib/store/post/store.js`, `add` in
`lib/store/comments/store.js`):

1. **Snapshot** the current values. Restore *those* on failure — don't assume the inverse of
   what you just wrote, or two failed toggles leave the count drifting.
2. **Apply the guess to every copy of the entity.** A post can be on screen twice, because
   the open overlay sits on the live feed; move one copy and the two visibly disagree the
   moment the overlay is dismissed.
3. **Reconcile with the server's authoritative value** — `{ liked, likes }` for a toggle, the
   created resource swapped in for the temporary row on a create. Don't leave the guess in
   place.
4. **Mark a not-yet-created row `pending`** so the UI can dim it and refuse to act on
   something with no server id yet.
5. **Don't let a slower read undo a faster write.** Writes settle faster than reads, so a
   detail fetch issued *before* a tap can land afterwards carrying the pre-tap tally and
   visibly revert it. `post` tracks the ids with a like in flight (`liking`) and keeps the
   client's `liked`/`likes` when merging a response that raced one.

Cross-store tallies (a new comment bumping the post's comment count) go through an action on
the other store — `bumpCommentCount` — never by reaching into its state. Undo them on
failure too.

### Cross-store reads

Never use React contexts. If one store needs another, import the other store and read it imperatively:

```javascript
// lib/store/nodes/store.js
import useEventStore from '@/lib/store/events/store'
import useGlobalStore from '@/lib/store/global.store'

deploy: async (nodes, navigate) => {
    // ... do work
    await useEventStore.getState().refresh()
    useGlobalStore.getState().clearErrors()
    navigate?.(ROUTES.EVENTS)
}
```

**Keep the dependencies one-directional.** Today they form a chain — `comments` → `post` →
`feed` — and each arrow is a narrow, named action (`bumpCommentCount`, `patchPost`), not a
reach into the other store's state. Two stores that import each other are a design smell,
not just a bundler problem: it means neither owns the entity. Decide which one does.

### The hook layer

Every store has a matching `hook.js` that components consume. Hooks are the **only** thing components touch.

Three non-negotiable patterns inside hooks:

1. **`useShallow` for multi-selectors.** Pull every value you need in one selector so the component re-renders on shallow changes only.
2. **Initial-load gate via `skeleton`, derived so it paints on the first frame.** Expose a `skeleton` flag derived straight from readiness — `skeleton = !ready` for a primary load, `skeleton = items.length === 0` for a secondary resource. Both are already truthy on the component's very first render (the store boots `ready: false` / `items: []`), so the skeleton is present on frame one rather than fading in a beat late. Once loaded, `ready`/data stays truthy, so refreshes never re-flash it. **Do not** derive it as `!ready && loading` — `loading` is false until the fetch effect runs *after* the first paint, which produces the no-skeleton → fade-in → fade-out flash.
3. **Never debounce the flag.** Rule 2 is what prevents a flash: because `skeleton` is already truthy on the first render, there is no no-skeleton → fade-in → fade-out sequence to suppress. Hooks must **not** wrap the flag in a delay (the old `useDelay` wrapper is gone), and stores must **not** race a `Promise.all([api.get(...), mockDelay(...)])` floor of their own.

   Reads now hit Postgres, so response times are real and variable — a fast query can resolve in tens of milliseconds. If a skeleton genuinely flickers, fix it in the transition (`<Transition fast>`), never by slowing the API down.

```javascript
import { useShallow } from 'zustand/react/shallow'
import { useEffect, useMemo } from 'react'
import useAppStore from './store'

export const useApps = () => {
    const [items, ready, init] = useAppStore(
        useShallow(state => [state.items, state.ready, state.init])
    )

    useEffect(() => { init() }, [init])

    /* Painted on the first frame; cleared once ready. The server floors every read at
     * frame, so no debounce is needed to avoid a flash. */
    const skeleton = !ready

    return useMemo(() => ({ items, skeleton }), [items, skeleton])
}

/* Lives in the *item* store's hook (lib/store/post/hook.js), not the list's. */
export const useApp = (id) => {
    const [current, ready, load, reset] = useAppStore(
        useShallow(state => [state.current, state.ready, state.load, state.reset])
    )

    /* Fetch on id change, and clear on unmount so the next open doesn't flash the
     * previous item. Note this does NOT wait on the list's `ready` — detail is fetched
     * by id at runtime and never read out of `items`. */
    useEffect(() => {
        if (!id) return
        load(id)
        return () => reset()
    }, [id, load, reset])

    return useMemo(() => ({ current, skeleton: !ready }), [current, ready])
}
```

Hook rules:

- A hook may return action functions, but it should never expose the raw store. Components consume only the returned object.
- Wrap any returned action in `useCallback`.
- **Navigation belongs to the action; the hook passes the router in.** The hook grabs `useRouter()` from `next/navigation` and hands it to the store action, which calls `router.replace(...)` after mutating state. Keeps the redirect co-located with the state change that warrants it.

  ```javascript
  // lib/store/auth/hook.js
  import { useRouter } from "next/navigation"

  export const useLogin = () => {
      const loginUser = useAuthStore(state => state.login)
      const router = useRouter()
      const login = useCallback(
          (email, password) => loginUser(email, password, router),
          [loginUser, router],
      )
      // ...
  }

  // lib/store/auth/store.js
  login: async (_email, _password, router) => {
      // ...set loggedIn + user...
      router.replace(ROUTES.DEFAULT)
  }
  ```

### `useShallow` discipline

Do **not** write multiple single-key selectors:

```javascript
// BAD — four subscriptions, four re-render channels
const init = useAppStore(state => state.init)
const ready = useAppStore(state => state.ready)
const loading = useAppStore(state => state.loading)
const items = useAppStore(state => state.items)

// GOOD — one subscription, shallow-equality re-renders
const [init, ready, loading, items] = useAppStore(
    useShallow(state => [state.init, state.ready, state.loading, state.items])
)
```

---

## Global Store + Global Hook

When you add a new store, you **must** wire it into both files:

### `lib/store/global.store.js`

Orchestrates `initAuthorizedStores`, `reset`, and `clearErrors` across every domain store.

```javascript
import { create } from 'zustand'
import useAppsStore from '@/lib/store/apps/store'
import useAuthStore from '@/lib/store/auth/store'
import useEventsStore from '@/lib/store/events/store'
import useNodesStore from '@/lib/store/nodes/store'

const useStore = create((set, get) => ({
    initAuthorizedStores: () => {
        const appsStore = useAppsStore.getState()
        const eventsStore = useEventsStore.getState()
        const nodesStore = useNodesStore.getState()
        return Promise.all([eventsStore.init(), appsStore.init(), nodesStore.init()])
    },
    reset: () => {
        useAppsStore.getState().reset()
        useAuthStore.getState().reset()
        useEventsStore.getState().reset()
        useNodesStore.getState().reset()
    },
    clearErrors: () => {
        useAppsStore.getState().clearErrors()
        useAuthStore.getState().clearErrors()
        useEventsStore.getState().clearErrors()
        useNodesStore.getState().clearErrors()
    },
}))

export default useStore
```

### `lib/store/global.hook.js`

Aggregates `ready` and `error` across every store; consumed by `App.jsx` and `useErrorListener`.

```javascript
import { useMemo } from 'react'
import useAppsStore from '@/lib/store/apps/store'
import useAuthStore from '@/lib/store/auth/store'
import useEventsStore from '@/lib/store/events/store'
import useNodesStore from '@/lib/store/nodes/store'
import useGlobalStore from '@/lib/store/global.store'

export const useErrors = () => {
    const appsError = useAppsStore(state => state.error)
    const authError = useAuthStore(state => state.error)
    const eventsError = useEventsStore(state => state.error)
    const nodesError = useNodesStore(state => state.error)
    const clearErrors = useGlobalStore(state => state.clearErrors)

    return useMemo(() => ({
        errors: { apps: appsError, auth: authError, events: eventsError, nodes: nodesError },
        clearErrors,
    }), [appsError, authError, eventsError, nodesError, clearErrors])
}

export const useReady = () => {
    const appsReady = useAppsStore(state => state.ready)
    const authReady = useAuthStore(state => state.ready)
    const eventsReady = useEventsStore(state => state.ready)
    const nodesReady = useNodesStore(state => state.ready)
    return useMemo(
        () => appsReady && authReady && eventsReady && nodesReady,
        [appsReady, authReady, eventsReady, nodesReady]
    )
}
```

**Checklist when adding a new domain store** (e.g. `installs`):

- [ ] Create `lib/store/installs/store.js` matching the template above.
- [ ] Create `lib/store/installs/hook.js` with `useShallow` selectors and a `skeleton` flag.
- [ ] Import the store inside `global.store.js` and add it to `initAuthorizedStores`, `reset`, and `clearErrors`.
- [ ] Import the store inside `global.hook.js` and add it to both `useErrors` and `useReady`.

---

## Error Handling

**Never render an inline error string in a component.** Errors flow:

```
store sets `error.<key>` → useErrorListener observes via useErrors() → sonner toast
```

`App.jsx` already mounts the listener:

```jsx
import useErrorListener from '@/lib/hooks/useErrorListener.hook'
useErrorListener()
```

So in your store you only need:

```javascript
catch (error) {
    set(state => { state.error.login = Array.isArray(error) ? error : ["Login failed. Please try again."] })
}
```

…and `useErrorListener` logs each message to the console and shows a toast automatically.

### Toasts in stores

**Do not call `toast.error` (or any error toast) inside `store.js`.** `useErrorListener` is the single path for surfacing store errors — calling `toast.error` in a store alongside `set(state => { state.error.<key> = … })` produces duplicate notifications.

Stores **may** call `toast.success` after a successful mutation when the operator should get immediate affirmative feedback (e.g. "Node registered successfully", "App deployed successfully"). Success toasts are not wired through the error listener.

**A store may toast *before* the request resolves, but only alongside an optimistic write, and only when it dismisses that toast on failure.** `comments/store.js` → `remove` is the reference case and currently the only one. The rule that makes it safe is that the toast and the row must tell the same story at every instant: the row disappears and the toast appears in the same frame, so the toast is the acknowledgement of the *gesture* rather than a report of the round trip — arriving a round trip after the row has already gone reads as a second, unrelated event. On failure the row is spliced back at its original index and the toast is dismissed **by id** (`toast.dismiss(toastId)`), never left to expire, so a restored comment is never accompanied by a toast still claiming it was deleted.

Do not reach for this by default. A mutation whose optimistic write is not itself a visible removal has nothing to stay in sync with, and `toast.success` after the await is the right shape for it. Administrative writes — anything in `members/store.js` — are deliberately *not* optimistic and must not toast early: the operator needs to know the server agreed, and a role change that silently reverts is worse than one that takes a round trip to confirm.

Only in **extenuating circumstances** should a store toast an error directly — for example, when the failure must be communicated but cannot be represented in `error.<key>` without breaking the global listener contract. If you think you need this, prefer fixing the error state shape instead.

**Forbidden** in components:

```jsx
{/* DO NOT do this */}
{error && (
    <p className="text-sm text-destructive">
        {Array.isArray(error) ? error[0] : "Something went wrong."}
    </p>
)}
```

If you ever need to clear a specific error after the user retries, expose a `clearError(key)` from the store and return it from the hook (see `auth/store.js` and `useLogin`).

---

## Routing

Routing is **Next.js App Router** file convention under `src/app/`. A folder is a route; `page.jsx` is the page, `layout.jsx` wraps the pages beneath it and **persists across navigation within its segment**. Two route groups (folders in parens, contributing no URL segment) split the app:

- `app/(public)/` — unauthenticated (`/login`).
- `app/(protected)/` — the authenticated shell (nav + topbar). Its `[...not-found]/page.jsx` catch-all renders the 404 **inside** the shell (replacing the old `path: '*'`).

Both groups are gated by the wrapper components in `components/AuthGate.jsx` (see Route guards below).

To add a route: create the folder + `page.jsx`. Navigate with `next/link`'s `<Link href>` and `next/navigation`'s `useRouter()` / `usePathname()` — never `react-router`. Route constants still live in `ROUTES` (`lib/constants.js`); keep using them for `href`s.

### Page transitions — `<PageTransition/>` + `<FrozenRouter/>` (the important part)

The fade between routes is the trickiest thing the App Router migration had to preserve, **especially on nested pages** (Settings). Two components do it, both `"use client"`:

- **`components/PageTransition.jsx`** — wraps a layout's `{children}` in `<AnimatePresence mode="wait">` + a keyed `motion.div` fade. Because a **layout persists** across navigation, the `AnimatePresence` lives long enough for exit animations to actually play (a `template.js` would remount and kill the exit). It accepts:
  - `getKey(pathname)` — lets a layout collapse a group of routes to one key so navigating *within* that group doesn't fade at this level (the nested layout handles it instead).
  - `initial`, `fast`/`slow`, `onExitComplete` (used to scroll the container to top).
- **`components/FrozenRouter.jsx`** — freezes the App Router's `LayoutRouterContext` for the subtree that is animating *out*, so the exiting page keeps rendering its **old** route instead of flashing the new one mid-fade.

**Why the FrozenRouter is presence-aware (do not "simplify" it):** the well-known recipe freezes context on mount forever. That breaks nested transitions — when a parent key is deliberately held stable (Settings collapses `/settings*` to one key), a permanently-frozen context stops the child segment from ever updating. Instead it keys off framer-motion's `useIsPresent()`: while present it passes the **live** context straight through (nested navigation keeps working); only once the subtree starts exiting does it pin to the last value it saw while present.

```jsx
// components/FrozenRouter.jsx (essence)
const context = useContext(LayoutRouterContext)
const isPresent = useIsPresent()
const frozen = useRef(context)
useEffect(() => { if (isPresent) frozen.current = context })
return (
    <LayoutRouterContext.Provider value={isPresent ? context : frozen.current}>
        {children}
    </LayoutRouterContext.Provider>
)
```

**Two-level wiring (mirrors the old `RouteTransition`/`Outlet` split):**

```jsx
// app/(protected)/layout.jsx — top level. getKey comes from the shared resolver, never
// an inline startsWith: it collapses nested trees and slide routes off the registries.
<PageTransition getKey={pageTransitionKey} onExitComplete={scrollToTop}>{children}</PageTransition>

// app/(protected)/settings/layout.jsx — nested level. Keyed by full pathname (default getKey),
// so General ↔ Users fades while the Settings pane itself stays mounted.
<PageTransition initial={false}>{children}</PageTransition>
```

**Which routes are exempt from the fade is data, not code.** Every "this path is special" rule lives in two registries in `lib/constants.js` and is resolved by pure helpers in `lib/utils.js`. **Never hand-roll `pathname.startsWith(...)` at a call site** — add the route to the registry and every consumer (transition key, nav highlight, slide overlay) picks it up at once.

| Registry (`lib/constants.js`) | Meaning |
|---|---|
| `NESTED_TRANSITION_ROUTES` | Route trees that collapse to one top-level key because a nested layout runs its own `<PageTransition/>` (currently `/settings`). |
| `RUNTIME_ROUTES` | Routes whose dynamic segment is only knowable at runtime, so they have no page file (`/p`, `/u`, `/notifications`). Each declares how it presents — `slide: true` for an overlay, `slide: false` for an ordinary page. See **Runtime routes** below. |

| Resolver (`lib/utils.js`) | Answers |
|---|---|
| `slideRouteFor(pathname)` | The matched slide route + its dynamic `param`, or `null`. |
| `baseRouteFor(pathname)` | The route the shell should behave as if it's on (a slide route → its base). |
| `pageTransitionKey(pathname)` | The key for the top-level `<PageTransition/>`. |
| `isRouteActive(pathname, href)` | Whether a nav destination reads as current. |

Page components do **not** add their own top-level `PageTransition` — the layout owns it. They may still use `components/Transition.jsx` internally for skeleton/content swaps (see the group/users table).

> **`eslint`:** `FrozenRouter` reads a ref during render on purpose; `react-hooks/refs` is disabled for it in `eslint.config.js`. Don't re-enable it there.

### Runtime routes — real URLs with no page file

A **runtime route** is a real, shareable URL whose dynamic segment could not have been known when the bundle was built: a post id, a group id. `output: "export"` requires `generateStaticParams` for every dynamic segment, so a `/p/[postId]` folder would mean enumerating every openable id ahead of time — impossible against a live database, and it would cap the app at a build-time corpus.

The way out is to stop asking the router. These routes are reached by **shallow history navigation** — `pushRoute(path)`, which is `history.pushState`, which the App Router treats as a URL sync and reflects through `usePathname()` without touching the segment tree — and the shell resolves the *pathname* against the `RUNTIME_ROUTES` registry. No segment exists, so there is nothing to enumerate, and the URL is still real and shareable. `router.push` is not an alternative: in the export there is no route to push to.

Adding one is two lines — an entry in `RUNTIME_ROUTES` declaring how it presents, and an entry in `RUNTIME_SURFACES` (`components/RuntimeRoute.jsx`) saying what it draws.

**The mechanism and the presentation are deliberately separate.** The sliding overlay was the first consumer of the URL trick, not the reason for it, and for a while the two were welded together. They are now split at `slideRouteFor`, which resolves only `slide: true` entries — and *everything* overlay-flavoured keys off that function rather than off `runtimeRouteFor`:

| | `slide: true` | `slide: false` |
|---|---|---|
| Drawn by | `<SlideRouter/>`, over the shell | `<RuntimeRoute/>`, in the shell's page slot |
| Base surface | stays mounted, pushed off-screen | replaced |
| Page transition | suppressed (`pageTransitionKey` → base) | ordinary cross-fade |
| Nav highlight | stays on the base route | none |
| Cold load | `<SlidePage/>` from the catch-all | same component as in-app |
| Example | `/p/:postId`, `/notifications` | `/events/s/:sheetId` |

Pick `slide: false` for anything that is a *place you go* rather than something you peek at and come back from.

> **First ask whether it needs a URL at all, and then whether it needs a *runtime* one.** Group settings is a static tree at `/group` — an id in the URL would have forced `generateStaticParams`, so the switcher selects the group on the way in and all three pages resolve against the selection instead. Somebody's public profile went the other way and became a modal: it is glanced at from a byline and dismissed, which is component state. A runtime route earns its complexity only when an id genuinely has to be addressable, which so far is a post. Two lessons survive from the detour, both worth keeping:
>
> - **A page whose subject comes from the URL wants its id in the path, not a query parameter.** `/settings/groups/edit?org=<id>` flashed "Group not found" on every exit — leaving a page clears its search params while the outgoing surface is still cross-fading, so a screen deriving its subject from the param had one frame with no subject.
> - **`<RuntimeRoute/>` resolves its route once, on mount.** `<FrozenRouter/>` pins `LayoutRouterContext` for an exiting subtree but *not* the pathname, so a live `usePathname()` read inside the outgoing page swaps its content to the incoming route before the fade-out plays — the surface appears at full opacity, fades out, then fades in. Two flashes for one navigation. Latching makes the exiting instance render what it was mounted for.

### Slide routes — `<SlideRouter/>` (overlay routes that push the page behind them)

A **slide route** is a real, shareable URL that, when reached by a soft nav from inside the app, opens as a full-screen surface sliding in from the right while the page behind it stays mounted and is pushed off to the left. Dismissing reverses it. The same URL opened cold (hard nav / refresh / a shared link) renders the same surface as a full-viewport page instead. `/p/:id` (a post) is the reference implementation.

**A slide route has no page file of its own**, because it is a runtime route — see above for why, and for the registry both presentations resolve against.

Three properties make it more than a modal:

- **The surface behind stays mounted** — the feed keeps its scroll position and never refetches, because opening one changes the URL *without* changing the rendered route.
- **The push is coupled** — the incoming surface and the base are both a full viewport wide and both translate a full viewport on the same `SLIDE_TRANSITION` curve, so their touching edges stay locked together for the whole gesture. Same distance is what makes it read as one movement; different distances on the same curve visibly decouple.
- **It animates out before unmounting** — dismissal plays the exit to completion, with content intact, then unmounts.

#### How the URL changes without the route changing

Next gives exactly one primitive for "new URL, same route": **`history.pushState`**, which the App Router treats as a URL sync and reflects through `usePathname` without touching the segment tree. So `openSlide(path)` is a `pushState` and `closeSlide()` is a `history.back()` — which is also why Android's hardware back button dismisses a slide route for free, with no handler registered.

Two rules follow:

- **Open with `openSlide(path)`, never `router.push`.** A real navigation unmounts the surface underneath, which is the one thing a slide route can't survive.
- **Dismiss with `closeSlide()`**, which unwinds the entry it pushed. It returns `false` when there is no entry to unwind (a cold deep link) — then navigate to the base route instead. See `PostView`'s `dismiss`.

The tradeoff to know about: while a slide route is open, the router's segment tree says the app is on the base route while the URL says otherwise. The next real navigation is computed from the tree and lands correctly, so this resolves itself.

> **History note — do not reintroduce `@modal`.** This replaced an `@modal/(.)p/[postId]` intercepting route, which held the base mounted by asking Next to intercept. `output: "export"` — the native build, see `native-architecture.md` — rejects it: the build dies with `Intercepting routes are not supported with static export.` (verified on Next 15.5.23; note the error only surfaces *after* you satisfy `generateStaticParams`, so the first failure you see is a misleading complaint about missing params). Interception would not buy anything here anyway — the interceptor is itself a dynamic segment needing enumeration, so it makes the build-time-ids problem worse, not better. The shallow version is also simpler: no parallel slot, no `default.jsx`, no interceptor page, and none of the slot-teardown hazards those carried.

`<SlideBase/>` is the other half: it *is* the shell's scroll container (see **Scrolling** below) and drives the coupled push. It slides only on mobile — desktop presents slide routes as a centered dialog over a still base. Because the container keeps its scroll offset through a pure horizontal transform, and the surface above it is a separate fixed layer that can't touch it, the base is exactly where the reader left it on dismiss — no lock required.

`<SlideRouter/>` (mounted last in `app/(protected)/layout.jsx`) owns the surface, inside the layout's own `AnimatePresence`. Living in the persistent layout is what lets `AnimatePresence` retain the element — props and all — through the exit, so the surface keeps the param it opened with and never blanks mid-animation.

`<SlidePage/>` is the cold-load half, mounted from the protected shell's `[...not-found]` catch-all. It reads `usePathname()`, resolves it through `slideRouteFor`, and renders the matched surface in its `page` presentation; anything that isn't a registered slide route falls through to the `fallback` it was given (the 404). Because the catch-all matches infinitely many paths off a single sentinel `generateStaticParams` entry, every registered slide route gets cold-load handling with **zero** per-route enumeration.

#### Open/close gating, and stacking

`openedStack` (module-level state in `useSlideRoute.hook.js`) is the list of paths **the app itself has opened**, oldest first. `useActiveSlide()` derives from it:

- **`slides`** — every surface that should be on screen, outermost first. `activeSlides` truncates the stack at the current pathname: everything above it belongs to a forward history entry the reader has left, and a pathname that appears nowhere in the stack means the URL has moved off the slide routes entirely, which closes all of them.
- **`open`** — `slides.length > 0`.
- **`pushed`** — the base slides a full viewport, whatever the depth; one surface already covers it.

Two things follow, and both are load-bearing:

**The stack is the soft- vs cold-load signal.** A cold load of `/p/:id` (a shared link, or a refresh) has a matching pathname but an empty stack, because *this session* never opened it — so nothing is mounted behind it and `<SlidePage/>` must render it as a full-viewport page rather than an overlay. This is why paths are stored rather than a boolean or a count.

**A slide route can be opened from inside another one, and that is why it is a stack.** A notification opens the post it is about; the post has to sit *over* the list, and dismissing it must uncover the list rather than dump the reader on the feed. `<SlideRouter/>` renders the whole stack — the covered surfaces are completely hidden, so it costs a mounted subtree and nothing visual, and it is what makes the back gesture reveal what was underneath instead of animating a second surface in from the right as though it were being opened fresh.

**What is open is derived, never mutated on navigation.** There is no popstate listener and no ordering hazard: the URL is the source of truth and the stack is only the record of what this session opened. The single place that prunes is `openSlide`, which drops anything above the current path before appending — so backing out of one post and opening another cannot resurrect the first.

#### Adding a new slide route

Say you want `/e/:eventId` (a parish event) to slide over the feed. Four small, declarative steps — **no route folder, and no build-time enumeration** — and **no existing route is affected**, because everything keys off the registry and non-registered paths fall through every resolver unchanged:

1. **Register the route** in `lib/constants.js`:

   ```javascript
   export const ROUTES = { /* … */ EVENT: "/e" }

   export const RUNTIME_ROUTES = [
       { prefix: ROUTES.POST,  slide: true,  base: ROUTES.DEFAULT },
       { prefix: ROUTES.EVENT, slide: true,  base: ROUTES.DEFAULT },  // ← base = what it overlays
   ]
   ```

   ...and an `eventPath(id)` beside `postPath(id)` in `lib/utils.js`, so no caller builds the URL by hand.

   `slide: true` is what makes it an overlay: it alone stops the top-level `<PageTransition/>` cross-fading the base and keeps the base's nav tab highlighted while the surface is open. Declare `slide: false` instead — and omit `base`, which is meaningless without a surface underneath — and the same registration gives you an ordinary page at a runtime-resolved URL, rendered by `<RuntimeRoute/>` in the page slot. Steps 2 and 3 below are the slide-route path; see **Adding a page runtime route** after them for the shorter one.

2. **Build the surface** as a normal component (e.g. `components/EventView.jsx`) taking a `variant` (`"modal"` | `"page"`) and its param, and **compose it out of the three shared pieces rather than reimplementing them** — that is what keeps two slide routes moving identically instead of nearly so:

   | Piece | From | What it gives you |
   |---|---|---|
   | `<SlideSurface variant>` | `components/SlideSurface.jsx` | The full-screen sheet: `fixed` box, `--safe-top` inset, the lift over `--keyboard-inset`, and the enter/exit animation. Pass `className` for the surface's background; pass `ref` if it must measure itself. |
   | `useSlideDismiss()` | `lib/hooks/useSlideRoute.hook.js` | The close action *and* the Escape binding. Unwinds the pushed history entry, and falls back to a real navigation to the registry's `base` when there is none (a cold deep link). |
   | `slideSurfaceAnim(variant)` | `lib/utils.js` | The raw animation, if a surface needs its own wrapper. `modal` travels a full viewport on `SLIDE_TRANSITION`, locked to `<SlideBase/>`'s push; `page` fades, because a cold load has nothing behind it to be coupled to. |

   A surface still owns everything above that — `components/PostView.jsx` branches to a dialog on desktop and a Reels-style sheet on mobile; `components/NotificationsView.jsx` is the small version of the same shape. Model a new one on the second.

3. **Register the surface** in `RUNTIME_SURFACES` (`components/RuntimeRoute.jsx`). One entry serves both presentations — the in-app overlay and the cold load:

   ```jsx
   export const RUNTIME_SURFACES = {
       [ROUTES.POST]:  (param, variant) => <PostView variant={variant} postId={param} />,
       [ROUTES.EVENT]: (param, variant) => <EventView variant={variant} eventId={param} />,
   }
   ```

   A route with no dynamic segment (`/notifications`) simply resolves `param` as `null` and ignores it — a slide route is a presentation, not a shape of URL.

4. **Open it with `openSlide`** from the trigger (see `Feed.jsx`'s `openPost`), not `router.push`.

`<SlidePage/>` portals the `page` variant to `<body>` for you, so it escapes the shell's `z-1` page wrapper — which a slide route may itself be mid-transform on — and covers the viewport. A surface must **not** portal itself: the in-app `modal` is already rendered above the nav by `<SlideRouter/>`, and portaling it would trap its exit animation.

**Do not add a route folder.** There is no `app/(protected)/e/[eventId]/page.jsx`, and adding one is a regression: a dynamic segment forces `generateStaticParams` under the export, which puts you back to enumerating every id at build time. `<SlidePage/>` in the catch-all already serves the cold load for any registered prefix, for any param value, resolved at runtime. Nothing in `app/(protected)/layout.jsx` changes either — it already renders `<SlideRouter/>` generically.

#### Adding a *page* runtime route

The shorter half of the above: **the registry entry and the surface, and nothing else.** No
`<SlideSurface/>`, no `useSlideDismiss`, no `base` — `<RuntimeRoute/>` substitutes the surface
into the shell's page slot and `<PageTransition/>` cross-fades it like any other route. Reach it
with `pushRoute` (the same `history.pushState` primitive without the overlay bookkeeping), never
`router.push`, which has no segment to resolve in the export.

`/events/s/:sheetId` is the worked example of the second column, and of the note above it: a rota
is a *place*, reached from a list, from a notification and from a link somebody sent, so it
cross-fades into the page slot rather than sliding over one. Its prefix is nested under `/events`
because `isRouteActive` is a segment-safe prefix test — a sibling `/s` would leave the nav rail
dark on a page that is plainly part of Events.

**Choosing between the two matters, and the wrong choice is visible rather than merely untidy.**
`slide: true` is for something you peek at and come back from, where the surface behind must
survive — a post over the live feed. `slide: false` is for a *place*: somewhere you go, reached
from several other places, that may be navigated onward from.

The tell that a place has been registered as an overlay is a **double transition when you arrive
from anywhere other than its `base`.** `pageTransitionKey` collapses a slide route to that base,
so arriving at one from `/settings` moves the top-level key from `/settings` to `/` — which
cross-fades the settings page out and straight back in (the segment tree never changed, so it is
still what `children` renders) *underneath* a sheet animating in over it. Two animations for one
navigation. A page route keys on its own pathname, so there is one.

> **First ask whether it needs to be a runtime route at all.** A runtime route earns its
> complexity only when an id genuinely has to be addressable, and most surfaces that look like
> they need one do not. Somebody's profile is the worked counter-example: the *public* half is a
> card you glance at from a byline and dismiss, which wants component-state semantics — a handle
> tapped inside an open post must not take the post down — and the *editable* half is eight
> fields and a save, which is a place you go and is therefore a plain static page in the account
> tree (`/settings/info`). Neither half carries an id in a URL.

#### Rules
#### Rules

- **Never** re-derive slide-route behaviour inline (`pathname.startsWith("/p/")`) in a component. Use the resolvers, or add to the registry.
- **Never** open one with `router.push` — that unmounts the base and the push has nothing to slide.
- **Never** give a slide route its own route folder or an intercepting route. Both reintroduce build-time enumeration; interception additionally fails the export outright.
- Keep the surface and `<SlideBase/>` on the **same distance, curve, and trigger**. Using `<SlideSurface/>` is what guarantees this; if you hand-roll the motion instead, take it from `slideSurfaceAnim` rather than restating it.
- **Don't reimplement dismissal.** `useSlideDismiss()` already resolves the base off the registry, handles the cold-link fallback, and binds Escape. A surface that rolls its own is one that will not have the fallback.
- Give the surface a stable key across open→dismiss (handled for you by `SlideRouter`, which keys off the path it was opened at) so `AnimatePresence` tracks a single instance rather than remounting it.
- **Opening a slide route from inside one stacks it.** That is supported and needs no special handling — just call `openSlide` (see the notification rows in `components/Notifications.jsx`). A container that is *not* itself a slide route has to get out of the way itself, though: the desktop notifications popover closes on open, because Radix has no idea a surface appeared behind it.

### Route guards — `components/AuthGate.jsx`

Auth redirects are done by two client wrapper components, each applied once at the top of its route group's layout:

```jsx
// app/(protected)/layout.jsx        // app/(public)/layout.jsx
<ProtectedGate>{/* shell */}</ProtectedGate>   <PublicGate>{children}</PublicGate>
```

Each reads `useAuthGate()` — never `loggedIn` alone — waits for `useMounted()` so the persisted value has rehydrated, then redirects on a mismatch and renders `null` until it is satisfied, so protected content is never painted for a signed-out visitor. The condition is `mounted && settled`, and `settled` is the hook's own judgement rather than `ready`: a persisted session is an answer available on the first frame, and holding the shell shut for the session check means the app cannot start fetching a feed until it finishes. The exception is a magic-link callback in the URL, where deciding early would redirect and discard the tokens before they have been read — `useAuthGate` withholds `settled` for exactly that case.

**That window shows nothing — don't put a spinner back in it.** One used to live there, with a one-second minimum on screen so it couldn't flicker, which meant every cold start paid a full second whether or not there was anything to wait for. A blank frame or two is the honest picture of a fast session check; a spinner with a floor makes the app slower than it is on every launch. If a future boot genuinely takes long enough to need covering, fix the wait, not the picture of it.

**This is deliberately not middleware.** `src/middleware.js` used to do it, gating on a `grapevine-auth` cookie, and that is the idiomatic Next approach — but `output: "export"` (the native build) drops middleware silently, so the gate would vanish precisely where it matters. A client gate is the one form that works in both build targets. The cost is that the decision lands after mount rather than before the response; the `mounted` gate is what keeps that from flashing.

Full detail, and how to attach a real session, is in `auth-architecture.md`.

### Role-gated visibility (`<Privileged/>`, `<PrivilegedRoute/>`)

> **These hide UI; they do not secure anything.** Every rule here is enforced again on the server — `requireMembership(..., { role: "ADMIN" })` in the service layer is what actually stops a member from publishing. A gate that exists only on the client does not exist, because the API is reachable with `curl`. See `auth-architecture.md`.

Roles are hierarchical (`MEMBER` < `ADMIN`; compare via `ROLE_LEVEL` in `lib/constants.js`) and **scoped to one group** — being an admin of one parish grants nothing in another. Both helpers therefore take an optional `orgId`.

**Pass it, from `useCurrentOrg()`.** Omitting it falls back to the viewer's first membership, which was the right default when there was one group and is a bug now that a switcher exists: an admin of a parish reading their diocese would keep the parish's permissions. The fallback survives only for the moment before a selection resolves. Use the helpers in `components/Auth.jsx`:

- **`<Privileged role={…}>`** — inline UI (buttons, tabs, table actions). Renders children when the current user's role meets or exceeds `role`; otherwise renders `fallback` (default `null`, i.e. hidden).
- **`<PrivilegedRoute role={…}>`** — whole routes. Redirects unauthorized users instead of hiding content.

**Visibility convention — follow this whenever you gate UI above `ROLES.BASIC`:**

| Required role | Member | Admin |
|---------------|--------|-------|
| `ROLES.MEMBER` | visible | visible |
| `ROLES.ADMIN` | **hidden** | visible |

- **Members** must not see admin-only affordances — omit `disabled` so unauthorized users get `fallback` (hidden). The compose button in the nav is the worked example.
- Pass `disabled` only to signal that an action exists at a higher tier to someone plausibly close to it: the control stays visible but dimmed and non-interactive (`opacity-50`, `pointer-events-none`). Do not use it for a tier the viewer can never reach.

```jsx
import { Privileged } from '@/components/Auth'
import { ROLES } from '@/lib/constants'
import { useCurrentOrg } from '@/lib/store/org/hook'

/* Admin of the selected group — hidden from members, and hidden again the moment the
   viewer switches to a group they only belong to */
const { orgId } = useCurrentOrg()

<Privileged role={ROLES.ADMIN} orgId={orgId}>
    <Button onClick={handleEdit}>Edit group</Button>
</Privileged>

/* Admin of one specific group, named rather than selected — a row in a list of groups */
<Privileged role={ROLES.ADMIN} orgId={org.id}>
    <Button onClick={handleApprove}>Approve</Button>
</Privileged>

/* Admin of ANY group. Only for an affordance that sits outside a group's scope — today
   just the compose button, which lives in the nav above the switcher and asks which
   group to publish into itself. Anything rendered *inside* a group wants `orgId`. */
<Privileged role={ROLES.ADMIN} anyOrg>
    <ComposeButton />
</Privileged>
```

Reference: `components/Auth.jsx` (`Privileged`, `PrivilegedRoute`), `components/Compose.jsx` (the admin-only compose entry point). The underlying hooks are `useRole(orgId)`, `usePrivileged(role, orgId)`, and `usePrivilegedAnywhere(role)` in `lib/store/auth/hook.js`; `useCurrentOrg()` already exposes `isAdmin` resolved against the selection, so prefer that over calling `usePrivileged` again with the same id.

### The selected group — `lib/store/org/`

The group switcher is the app's context selector, and the store behind it is the one store in the repo that **owns a selection rather than a resource**. It fetches nothing: the list of groups comes from the viewer (`GET /api/me` already ships `orgs` with a role in each, read through `useOrgs()`), and what is genuinely the store's is the single `currentId` — persisted, so a reload lands back in the same parish, and re-validated against the viewer's real memberships on every boot.

**Org-scoped stores read the id, they are not pushed it.** Every scoped store holds the group it is currently showing and takes the target as an argument — `load(orgId)` — discarding responses whose group is no longer selected. Their hooks depend on `useCurrentOrg()`, so a switch re-runs the effect, `load` sees a different id, empties the list, drops `ready`, and the skeleton paints on the next frame.

That direction is deliberate and load-bearing. The obvious alternative — `select()` reaching into each store to invalidate it — makes a cycle for any store that must both *read* the current group and *be reset* by it: `feed` would import `org` for the id while `org` imported `feed` to reset it. Reading resolves it with no cross-store import at all. `members` established the pattern; `feed` follows it.

Consequences worth knowing:

- **A scoped store is out of `initAuthorizedStores`.** It has no request to make until a group is resolved, and the resolution happens in a React effect. Boot it from its own hook instead.
- **`skeleton` covers both waits.** `resolvingOrg || !ready` — the moment before a group is selected is as much "nothing to show" as the fetch itself, and letting the first fall through flashes an empty surface.
- **Anything scoped must be emptied on switch, not just refetched.** Leaving `items` in place shows one parish's rows under another's name for a round trip, and every row's actions would write to the wrong group if tapped.

**Two things hang off the switcher, and they resolve differently.** Creating a group is the `creating` flag in the org store (a flag, not an id — there is no group yet to name it after), drawn by `<OrgCreator/>`, which the shell mounts once because the desktop dropdown and the mobile panel are separate subtrees that must not each own a copy. Administering one is a *place*: the gear selects that row's group and navigates to `/group`, whose three pages all resolve against the selection — which is what keeps a cuid out of the URL and lets them be static routes. Deleting is the danger zone at the foot of `/group/info`, gated on the server-composed `canDelete` rather than on any rule the client re-derives — see §11 of `backend-architecture.md`.

**A New group row sits at the foot of the switcher, drawn only for a platform `OWNER`** — `usePlatformOwner()`, which is deliberately *not* `usePrivileged`: that one walks `ROLE_LEVEL` and answers "may I act in this group", and OWNER is not a rank above ADMIN but a different question with no group in it. The entrance is here because this menu is already the answer to "which groups do I have", so "and make another" belongs at the bottom of that answer.

**`useOrgCreator` is where two stores meet, and it is a hook for that reason.** The write lands in `user.orgs` so it belongs to the auth store (`createOrg`, beside `updateOrg`); the selection belongs to the org store. Composing them in the hook is what keeps the imports one-directional — `org` already reads `auth`, and `auth` calling back would be the cycle this section warns about. Creating a group **selects it**, because the next thing the owner does is invite people or post, both of which are scoped to the selection.

**The switcher's two presentations are two components, not one responsive one** (`components/OrgNav.jsx`). Desktop is a dropdown over a nav that never moves. Mobile *pushes* the shell aside rather than covering it: `--org-nav-width` in `globals.css` is both the panel's width and the distance every displaced layer travels, and the layers apply it themselves (`SlideBase`, the mobile rail, the hamburger) off `useOrgNav().shift`, all on `SLIDE_TRANSITION`. Do **not** wrap them in one shifting container — a transformed ancestor becomes the containing block for every `position: fixed` descendant, which drags the slide-route surface along with the shell. `SlideBase` is where the two possible displacements are resolved, and a slide route wins.

### Prop drilling — don't

If the current page already has a slug, ID, or user object via a hook, the **subcomponent** must call the same hook (or a focused variant) instead of having the value passed down. Stores are the cheap source of truth.

```jsx
// BAD
<VersionsTable userId={user.id} appSlug={app.slug} />

// GOOD — VersionsTable internally:
const { current } = useApp()
const { user } = useUser()
```

---

## Scrolling & overlays

**A fixed container is the app's only scroller — not the document.** The protected shell mounts one `fixed … overflow-y-auto` box (the `<SlideBase/>` in `(protected)/layout.jsx`) and the page lives inside it; `<html>`/`<body>` never scroll. The container's node is shared through `<ScrollProvider>` (`lib/providers/Scroll.jsx`): `useScroll()` returns `{ scrollRef, scrollToTop }`, the layout attaches `scrollRef` to the container, and every scroll read/write targets that node.

On mobile the container is bounded to the usable viewport (`top-(--safe-top) bottom-(--bottombar)`), not `inset-0`, so its scrollbar starts below the status-bar notch and stops above the mobile rail instead of running edge-to-edge under the system chrome — which is where an edge-to-edge Capacitor WebView would otherwise draw it. Both insets reset on `md:` (`md:top-0 md:bottom-0`), so desktop keeps a full-height scroller inset past the rail.

This is what keeps overlays simple: a surface that covers the screen (slide route, dialog, drawer) is a separate `fixed` layer *over* the container, so the container behind it can't be reached and scrolled — no scroll lock, no second scrollbar, and it keeps its offset so the reader lands right where they left off on dismiss.

Rules that follow from it:

- **There is one shell scroller, and it already exists.** Don't wrap page content in another viewport-height scroll container — render into the shell container. Inner scrollers are still fine for *bounded* panels — a comment thread, a dropdown, a popover list — and those should carry `overscroll-contain` so hitting their end doesn't chain out.
- **Prefer `dvh` over `vh`.** `vh` is the tall viewport on mobile, so anything sized in `vh` hides under the browser's own chrome.
- **Chrome is `fixed`, the scroll container is one more fixed sibling.** The rail, the mobile bar, the grain, and the background gradient are fixed siblings in the shell's stacking context (z: backdrop 0, scroll container 1, rail 2, grain 10, mobile bar 20, overlays 50).
- **Read scroll via framer-motion, not a hand-rolled listener.** The mobile bar dims out while scrolling down and reappears on scroll up via `useVibing` (`lib/hooks/useScroll.hook.js`), built on framer-motion's `useScroll({ container })` (pointed at the shell container) + `useMotionValueEvent` — event-driven, no `scroll` listener and no timer. Reach for it for any new scroll-position UI.
- **Overlays need no scroll lock.** Because the scroller is a container and not the document, a `fixed` overlay above it already blocks all interaction with the page behind — there is nothing to freeze. (This is the opposite of the document-scroller model, where a lock was mandatory.)
- **Pull-to-refresh is hand-built, not native.** The scroll container pins `overscroll-behavior: none` (the `overscroll-none` class in the layout), which kills the browser's rubber-band *and* its built-in pull-to-refresh so the app can own the gesture identically in a browser and the Capacitor WebView (which has no native pull-to-refresh). `usePullToRefresh(onRefresh)` (`lib/hooks/useScroll.hook.js`) hangs non-passive touch listeners off the *container* — the only way to `preventDefault` the drag — and only claims a clear downward pull that starts at the very top (`scrollTop === 0`); anything else (scroll, horizontal carousel swipe) goes back to the browser. The `<PullToRefresh>` component wraps a page's content, translating it down and riding the ripple loader in the gap above (mobile/touch only — a mouse never fires it). It's wired on the home feed (`(protected)/page.jsx`); `onRefresh` should return the store's `refresh` promise.
- **Navigate with `scroll: false`.** `<Link scroll={false}>` / `router.push(path, { scroll: false })`. The layout scrolls the container to top itself from `PageTransition`'s `onExitComplete` (via `scrollToTop` off `useScroll()`), once the cross-fade has played; Next's own scroll fires up front and yanks the outgoing page.

### Safe areas

`viewport-fit=cover` is set in the root layout's `viewport` export, so `env(safe-area-inset-*)` reports real values on notched devices and in the Capacitor WebView. They are exposed as `--safe-top` / `--safe-right` / `--safe-bottom` / `--safe-left` in `globals.css`, plus `--bottombar` (the mobile rail's height *including* the home-indicator inset).

Anything that hugs a screen edge pads by these — use `pb-(--safe-bottom)`, `pt-(--safe-top)`, and clear the mobile rail with `--bottombar` rather than `--bottombar-height`.

### Keyboard-aware surfaces

Any surface with a text input near the bottom of the screen (a comment composer, a chat box, an inline reply) has to lift itself clear of the on-screen keyboard **itself** — nothing does it for you. On iOS the Capacitor WebView is deliberately **not** resized when the keyboard opens; instead `useKeyboardInset` (in `useNative.hook.js`) mirrors the keyboard's height into a CSS variable as the show/hide animation begins. The full rationale — why we don't use the plugin's `resize: "native"`, and how it behaves on Android and in a browser — is the **keyboard section of `native-architecture.md`**; read that before touching any of this.

Three tokens fall out of it (defined in `globals.css`):

| Token | Use |
|---|---|
| `--keyboard-inset` | How much of the bottom edge the keyboard covers; `0px` when down (and always `0px` in a browser / on Android, which shrink the viewport themselves) |
| `--bottom-inset` | What a bottom-pinned element must clear: `max(--safe-bottom, --keyboard-inset)` — never both, since a raised keyboard already covers the home indicator |
| `--viewport-height` | `100dvh` minus the keyboard; size against this where something has to fit in the room the keyboard leaves |

**The reusable wrapper is `<KeyboardAwareColumn>`** (`components/KeyboardAware.jsx`) — reach for it first. It is a flex column that pads its foot by `--bottom-inset` (with the transition that rides the keyboard's animation), so its **last child stays on top of the keyboard** while a scroll region above it gives up the room. Drop it into a bottom-anchored surface with a scrollable region (`overflow-y-auto min-h-0`) and the pinned control last:

```jsx
import { KeyboardAwareColumn } from "@/components/KeyboardAware"

<KeyboardAwareColumn>
    <div className="flex-1 overflow-y-auto overscroll-contain">{/* thread */}</div>
    <Composer />   {/* rides up onto the keyboard */}
</KeyboardAwareColumn>
```

`components/Comments.jsx` (the mobile drawer) is the reference. For a **full-screen sheet** where the media above should also yield room rather than a scroll region absorbing it all — `components/PostView.jsx`'s mobile surface — the pattern is instead to move the fixed panel's own bottom edge (`bottom-[max(var(--bottombar),var(--keyboard-inset))]`) and cap the media at a share of `--viewport-height`. Use the column for a thread-plus-composer; use the moved-edge form for a whole surface.

**A Vaul drawer with an input needs two more things** (see `CommentsDrawer` / `CommentComposer` in `Comments.jsx`), both documented at length in `native-architecture.md`:

- **`repositionInputs={false}` on `<Drawer>`.** Vaul's default keeps a mobile-Safari scroll lock installed that hijacks `touchend` on inputs and hand-focuses them — which does not take in the WebView, so the field looks completely dead (no caret, no keyboard, hardware keyboard included). This is a hard requirement, not a nicety.
- **`data-vaul-no-drag` on the composer** so a touch that starts in the field reaches for it / selects text instead of swiping the drawer shut.

> **The blue ring on open.** Vaul focuses the drawer surface itself when it opens, and the WebView traces a focus outline around the whole sheet. `globals.css` drops it with a scoped `[data-vaul-drawer]:focus { outline: none }` (the surface is a passive container; the controls inside keep their rings). The same file sets `-webkit-tap-highlight-color: transparent` on `html` to kill the WebView's grey/blue tap flash app-wide.

---

## Styling & Theming (Tailwind v4)

### Hard rules

- **Tailwind v4** is configured via `@tailwindcss/postcss` (see `postcss.config.mjs`). All theme variables live in `src/globals.css` under `@theme`, `:root`, and `.dark`. **Do not change CSS variables unless the task explicitly asks for a theme change.**
- **`@utility` declarations** in `globals.css` (e.g. `panel`, `bg-dotted`) are off-limits unless the user explicitly asks.
- **No inline color literals** in `className`. Forbidden: `bg-[#ABCDEF]`, `text-[oklch(...)]`. Use theme tokens (`bg-primary`, `text-muted-foreground`, `border-border`, `text-success`, `text-warning`, `text-destructive`).
- **No `style={{...}}` prop** unless Tailwind genuinely can't express it. Always prefer string className.
- **Dark mode** is class-based (`.dark` on `<html>`), driven by **`next-themes`** (configured in `app/providers.jsx`, `localStorage` key `grapevine-ui-theme`). Use `dark:` variants in className. For runtime theme changes use `useTheme()` imported from `@/lib/providers/Theme` (a thin re-export of next-themes) — **never** roll your own. When rendering UI that depends on the *current* theme value (e.g. a theme switcher's active state), gate it on a `mounted` flag (`useEffect(() => setMounted(true), [])`) — next-themes returns the theme only after mount, so reading it during render without the gate causes a hydration mismatch (see `settings/page.jsx`).

### Layout tokens

Layout sizes are exposed as CSS variables in `globals.css`:

```
--nav-width        92px
--topbar-height    92px
--bumper           16px
```

Use them via Tailwind v4 arbitrary value syntax with the variable form: `w-(--nav-width)`, `h-(--topbar-height)`, `left-(--nav-width)`, `top-(--bumper)`. **Never** copy the literal pixel value into a class.

### Fonts

Four local faces, all declared as `@font-face` in `globals.css` and bundled from `src/assets/fonts/` — there is no `next/font` and no external stylesheet. **Material Symbols Rounded** (the `<Icon>` glyphs) and **Babe Sans** (`--font-display`, every `h1`) are shell faces, requested on the first paint of any screen. **PT Serif Caption** (`--font-reading`) is set by the Daily Read and nothing else.

That last one is the case to watch. A face only one screen uses is not requested until the reader opens that screen, and `font-display: swap` then repaints the page in it — so `useFontWarm` fetches it on an idle moment beforehand. **Adding a webfont means asking which kind it is**: shell faces need nothing, a screen-specific one belongs in that hook. Its header holds the reasoning.

### Custom font sizes

A bespoke typographic scale lives in `globals.css`. `text-xxs` and `text-button` are real classes — use them. `tailwind-merge` is extended in `lib/utils.js` to know about them, so `cn()` composes them safely.

### Class merging

Always merge with `cn()` from `@/lib/utils`:

```jsx
import { cn } from '@/lib/utils'

<div className={cn('rounded-full px-3', isActive && 'bg-muted', className)} />
```

`hashColorScheme(value)` in the same file produces a deterministic Tailwind color combo for `<Badge>`; reuse it instead of hard-coding badge palettes.

### Shared helpers (`lib/utils.js`)

`src/lib/utils.js` is the home for **reusable, pure helper functions** — formatting, sorting, mapping, validation, and other logic that is not React-specific and does not belong to a single domain.

**Always extract helpers out of store, hook, component, and page files** and add them here so the high-level code stays as clean as possible. If you define a standalone helper at the top of `store.js`, `hook.js`, `page.jsx`, or a component file, promote it to `utils.js` and import it back.

Rules:

- Export helpers as **named exports** (`export function deriveLatest(...)`, `export const toErrorList = ...`).
- Keep helpers **pure** when possible — no API calls, no Zustand store access, no hooks.
- Small private helpers used only inside one exported function may stay nested inside that function in `utils.js` (e.g. a sort key used only by `deriveLatest`).
- Import via `@/lib/utils` — never duplicate the same helper in multiple files.

Examples already in `utils.js`: `cn()`, `formatDate()`, `hashColorScheme()`, `gradientFor()`, `nodeLabelFromName()`.

### Public assets under a subpath — `appPath()` / `basePath()`

If the app is served under a base path (e.g. `/emc/ui`) rather than the host root, set `NEXT_PUBLIC_BASE_PATH` — `next.config.mjs` feeds it to Next's `basePath`, and `basePath()`/`appPath()` in `lib/utils.js` read the same env var. At the default (empty) base path everything is a no-op, which is the common case.

- `basePath()` = `(process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')`. `appPath(route)` prefixes it.
- **JS/JSX references to `public/` assets** (`<img src>`, inline `style={{ backgroundImage }}`, favicons assembled in JS, any `/foo.png` handed to the DOM) **must** go through `appPath('/foo.png')` — Next does **not** auto-prefix arbitrary root-absolute string literals with the base path, so a hard-coded `src="/nob.png"` would 404 under a subpath.
- **Favicon/icons** are declared via the `metadata` export in `app/layout.jsx` (`icons: { icon: "/favicon.svg" }`); Next applies `basePath` to those automatically — don't hand-prefix them.
- **CSS `url()`:** `url()` resolved *relative to `globals.css`* (the local fonts) is bundled by webpack and always resolves. Root-absolute Tailwind arbitrary values like `bg-[url('/grain.png')]` are **not** rebased under a subpath, so only rely on them when the base path is empty; otherwise route the asset through JS + `appPath()`. Do not convert existing `className` `url()`s to inline styles unprovoked — it violates the no-inline-style rule.

---

## Component Library — shadcn/ui

- All shadcn primitives live in `src/components/ui/`. Add new ones via the CLI from the repo root:

  ```bash
  npx shadcn@latest add <component>
  ```

- **`components/ui/` is the maintainer's, not an agent's. Agents: treat it as read-only.** These files are building blocks — import them, compose them, pass them a `className`, but do not edit them. This is not the usual "it's vendored, don't touch it" rule, because it isn't vendored: the CLI copies source in and shadcn has nothing more to do with it afterwards, and hand-tuning that source is precisely why it's used here instead of a packaged library like MUI. The fit and finish of these primitives — type scale, shape, contrast — is a stylistic call the maintainer makes by hand, and it is deliberately not delegated.

  Two consequences for an agent working in this repo:

  - **A primitive that differs from stock shadcn differs on purpose.** Do not "restore" it, do not flag it as drift, and do not reconcile it against upstream. If a change seems to belong in a primitive, say so and leave it alone; the call site or a composition in `src/components/` is where an agent's version of that change goes.
  - **Never run `npx shadcn@latest add` on a primitive that already exists.** The CLI overwrites and does not merge, so re-adding one silently discards hand-tuning. Use it only for a component the repo doesn't have yet.

  Current deviations, for recognition rather than for reverting: `input.jsx` (pill shape, leading `icon` prop), `label.jsx` (`text-xs`, `font-semibold`, `pl-2`), `drawer.jsx` (grab-handle size and contrast), and `input.jsx` / `textarea.jsx` both dropping upstream's `text-base` — that class is shadcn's workaround for iOS zooming a focused field under 16px, and `app/layout.jsx` already closes that with `maximumScale: 1` / `userScalable: false`, so keeping it would make every field larger on a phone than on desktop for nothing.

- Compositions, branded skins, and feature-specific widgets go in **`src/components/`** (PascalCase), and they may import from `components/ui`. This is where an agent builds. Examples in this repo:
  - `components/Drawer.jsx` — feature drawer that composes `components/ui/drawer.jsx`.
  - `components/Profile.jsx` — composes `components/ui/popover` + `components/ui/button`.

### Buttons

Use `<Button variant="..." size="...">` from `components/ui/button.jsx`. Variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`. Sizes: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. Don't create alternate buttons.

**Anything a reader is meant to press is `size="lg"`, with horizontal padding.** Not a preference: `default` is `h-9` with `px-2.5`, which is the size of a control *inside* something — a table row's action, a toolbar, a popover — and at the end of a paragraph on a phone it reads as a link that happens to have a border, sitting under body text it barely out-measures. `lg` is `h-12`, and because its padding is also `px-2.5` it needs the width added at the call site: `className="px-8"` for a pill sized to its label, `className="w-full sm:w-fit sm:px-10"` for one that fills the column on a phone and shrinks on a desktop. Every submit in the app already does one of the two — see `<Compose/>`, `<OrgCreator/>`, `<OrgSettings/>`.

So: reach for `lg` first and justify anything smaller. `sm`/`xs` are for dense chrome where a full-size control would crowd its neighbours, and `default` — the variant's own default, which is what you get by writing no `size` at all — is almost never what a page-level action wants. Writing `<Button onClick={…}>Turn on notifications</Button>` and shipping it is the failure mode this rule exists to stop.

The loading state is `<Ripple/>`, never a text placeholder — see **Action buttons during async work** below. `"Just a moment…"` in place of the label is the same mistake in a different dimension: it resizes the button mid-action and drops the name of the thing being done.

### Hyperlinks — `<Hyperlink/>` (HARD RULE)

**Never write `underline` or `hover:underline` by hand.** Anything that reads as a link — a real
link, a handle that opens a card, a word in prose that goes somewhere — is `<Hyperlink/>`, which
owns the one hover treatment the app has: a wipe that grows from the left on hover and retracts
to the right on leave, plus (on the default variant) the link colour.

It is a hard rule for the same reason `<Close/>` is. A hand-rolled `hover:underline` is a second
affordance that *looks* like the first and animates differently, and two of them in one paragraph
is two things a reader has to learn separately. It also drifts: the wipe's duration and thickness
live in one file, and a bare `underline` cannot follow them.

- **`soft`** keeps the inherited colour at rest and fades to the link blue on hover. That is the
  variant for a link inside prose or a byline, where a permanently blue word pulls the eye off the
  sentence it sits in. `<HandleLink/>` uses it.
- **No `href`** renders a non-navigating span, so it can wrap the label of a `<button>` that opens
  a surface rather than navigating — again `<HandleLink/>`.
- It is built from spans, so it is valid **inside a `<p>`**, which is where most of the app's
  links actually sit.

Two cases cannot use it, both because the wipe's box is an `inline-flex` sized to its content.
Text that must **`truncate`** would overflow rather than ellipse, and a **URL in a body** cannot
break mid-word, so a long address pushes the card wide. Give either one no hover treatment at all
rather than reaching for `underline` — see the author name in `<PostCard/>`, whose tap target is
shared with the avatar beside it and which is therefore already legible as one, and `<Linkify/>`,
which takes the link colour and nothing else.

### Close affordances — `<Close/>`

Any time a surface (drawer, sheet, dialog, popover, full-screen overlay) needs a "dismiss" / "close" / "X" affordance, use `<Close/>` from `@/components/Widgets`. It bakes in the floating-pill style (ghost, `size-9`, rounded-full, asymmetric drop shadow, `bg-background`, `<Icon>close</Icon>` content) so close buttons stay visually consistent across the app.

```jsx
import { Close } from '@/components/Widgets'
import { DrawerClose } from '@/components/ui/drawer'
import { SheetClose } from '@/components/ui/sheet'

// Drawer
<DrawerClose asChild>
    <Close aria-label="Close deploy drawer" className="absolute right-6 top-1" />
</DrawerClose>

// Sheet
<SheetClose asChild>
    <Close aria-label="Close register sheet" className="absolute top-5 left-5" />
</SheetClose>
```

Rules:

- **Do not** hand-roll a `<Button variant="ghost">` with `<Icon>close</Icon>` inside. Reach for `<Close/>` instead.
- Position the widget via `className` (`absolute top-* right-*` / `left-*`); the visual style is fixed.
- Always wrap in the matching primitive's `Close` component (`DrawerClose`, `SheetClose`, `DialogClose`, etc.) with `asChild` so the parent surface controls dismissal.
- Forward `aria-label` describing the surface being closed (e.g. `"Close deploy drawer"`) — the widget defaults to a generic `"Close"` which is fine but not ideal.
- If you ever need a close button with a different glyph (e.g. a back arrow), pass `children` to override; the styling stays.

### Reusable misc widgets — `components/Widgets.jsx` (DRY rule)

`components/Widgets.jsx` is the home for small, generic, reusable UI widgets that don't belong to a single feature — things like `<Close/>` (close affordance) and `<YayOrNay/>` (a green check / red X boolean indicator used by both the nodes table's "Is Installed" column and the users table's "Enabled" column).

**Never repeat misc component code — especially do not define throwaway components inside page files.** If you find yourself writing the same little component in more than one place (or even copy-pasting it once), stop and promote it to `Widgets.jsx` instead, then import it everywhere it's needed.

```jsx
// FORBIDDEN — same indicator hand-rolled inside two different page.jsx files
const IsInstalled = ({ value }) =>
    value ? <Icon className="text-success">check</Icon> : <Icon className="text-destructive">close</Icon>

// REQUIRED — define once in Widgets.jsx, reuse with context-specific props
import { YayOrNay } from '@/components/Widgets'

// nodes/page.jsx
<YayOrNay value={node.isInstalled} enabledLabel="Installed" disabledLabel="Not installed" />

// group/users/page.jsx
<YayOrNay value={user.is_enabled} />
```

Rules:

- Keep widgets in `Widgets.jsx` generic and prop-driven (e.g. `YayOrNay` takes `enabledLabel`/`disabledLabel` so the accessible label fits each context) rather than hard-coding feature-specific copy.
- Export them as **named** exports and import via `@/components/Widgets`.
- Page files (`page.jsx`) should consume widgets, not define reusable components. A component defined in a page is a smell that it belongs in `Widgets.jsx` (or, if feature-specific and composite, its own file in `components/`).

### Collapsibles — `components/ui/collapsible.jsx`

For any "show / hide", "expand / collapse", or "more / less" affordance, **always reuse the shadcn `Collapsible` primitive in `components/ui/collapsible.jsx`** — do not hand-roll a `useState(false)` + ternary, and do not invent a new "show/hide" component. The primitive handles ARIA (`aria-expanded`, `aria-controls`), keyboard, and the height animation via Radix + the `animate-collapsible-up/down` keyframes.

```jsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import Icon from '@/components/Icon'
import { cn } from '@/lib/utils'

<Collapsible open={open} onOpenChange={setOpen} asChild>
    <section className="flex flex-col pl-4">
        <div className="flex items-center justify-between">
            <h2>Title</h2>
            <CollapsibleTrigger asChild>
                <Button variant="ghost">
                    {open ? 'Hide' : 'Show'}
                    <Icon className={cn('transition-transform duration-200', open && 'rotate-180')}>
                        expand_more
                    </Icon>
                </Button>
            </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="pt-4">
            {/* content */}
        </CollapsibleContent>
    </section>
</Collapsible>
```

For the chevron, **rotate a single `expand_more` icon** with `transition-transform` + `rotate-180` instead of swapping between `expand_more` / `expand_less` — the rotation animates between states while a swap does not.

#### No outer spacing around `CollapsibleContent` — it causes a snap on close

`CollapsibleContent`'s height animates to 0, then Radix flips `data-state="closed"` and applies `hidden` (`display: none`). Anything that occupies space **outside** the animated element does **not** animate — it disappears in a single frame the instant the element is hidden, producing a visible "snap" of every pixel that wasn't inside the animation.

- **Do not** put `gap-*`, `space-y-*`, or sibling `mt-*` / `mb-*` between `CollapsibleTrigger` and `CollapsibleContent` (or between `CollapsibleContent` and the next block) on the parent. Flex / grid gap stays constant throughout the height animation and vanishes in one frame when Radix hides the element.
- **Do** put all spacing *inside* `CollapsibleContent` as padding (`className="pt-4"`, `className="pb-2"`, etc.). The component wraps `children` in an inner `<div>` so any class you pass lands inside the clipped region and animates away with the height — no extra space left to snap away.
- **Do not** undo that inner-wrapper structure or move padding back onto the animated outer box itself. With `box-sizing: border-box`, an element with `height: 0` cannot compress past its padding total, so the box stays N pixels tall until `hidden` kicks in — re-introducing the snap you just removed.

Same rule extends to anything above or below the collapsible. If you want spacing between the collapsing section and the next block, push that spacing into the collapsing block (`pb-*` on the inner content) rather than relying on the parent's outer flex gap. Treat `CollapsibleContent` as a self-contained box: every pixel of space it claims when open must live inside it.

### Forms

**Every form uses `react-hook-form` + `zod` + the `Form` primitives in `components/ui/form.jsx`. This is the default, not one option among several.** Reach for `<Form>`, `<FormField>`, `<FormItem>`, `<FormLabel>`, `<FormControl>`, `<FormDescription>` and `<FormMessage>` before writing a `<label>` or a `useState` per field.

The reason is not consistency for its own sake. Those wrappers carry things that are invisible until they are missing: `<FormLabel>` owns the `htmlFor`/`id` pairing, `<FormControl>` wires `aria-describedby` and `aria-invalid` off the field's error state, and `<FormMessage>` renders the resolver's message in the one place a screen reader has been told to look. Hand-rolled markup reproduces the visible half and silently drops the rest, and the loss does not show up in review — it shows up for someone using the app with a screen reader. A hand-rolled character counter and a manual `disabled` gate are the usual first symptoms; both are already solved by `<FormDescription>` and a schema.

Deviate only where a form is genuinely doing something the primitives cannot express, and say why in a comment. `<ComposeForm/>` is the one such case and is worth reading as the shape of a *justified* deviation: it still uses `<Form>`, `<FormField>` and `<FormControl>` throughout, and departs on exactly one point — validation is toasted rather than rendered through `<FormMessage>`, because its fields are borderless writing surfaces with no box to hang a message off and a line of red text under the caption shoves the photo strip down the moment someone taps Post. That is a deviation *inside* the system, argued from the layout. "This form is simple enough to do by hand" is not a reason; a simple form is exactly the one that costs nothing to do properly.

See `components/OrgSettings.jsx` for a plain instance, or the login screen for one with a two-step flow:

```jsx
const schema = z.object({
    email: z.email(),
    password: z.string().min(1, 'Password is required'),
})

const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

<Form {...form}>
    <form onSubmit={form.handleSubmit(async (data) => { clearError(); await login(data.email, data.password) })}>
        <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" disabled={loading} {...field} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />
        {/* ... */}
        <Button type="submit" size="lg" disabled={loading}>Sign In</Button>
    </form>
</Form>
```

Validation errors render inside `<FormMessage/>` (per-field, RHF-driven). Server errors still flow through `error.<key>` → toast.

Two habits that go with it:

- **`useWatch({ control, name })`, not `form.watch(...)`.** The latter hands back a function the React compiler cannot memoize safely, so it bails out of optimizing the whole component.
- **Re-seed by remounting, not by effect.** When a form's subject can change under it (editing a second group, a second post), give it `key={subject.id}` from the parent rather than resetting from a `useEffect` — `defaultValues` is then read once and is always the right subject's, and there is no effect to fight the `react-hooks/set-state-in-effect` rule with.

### Memoize `disabled` logic

When a form's submit gate is more than a single flag (e.g. `loading || !name.trim() || !label.trim()`), **always** lift it into a `useMemo`-backed `disabled` value and reuse it everywhere — the button's `disabled` prop, the submit handler's early-return guard, any other affordance that mirrors it. Don't repeat the same boolean expression inline in two places.

```jsx
// FORBIDDEN — same expression duplicated, easy to drift
const handleCreate = async () => {
    if (!name.trim() || !label.trim() || loading) return
    // ...
}

<Button disabled={loading || !name.trim() || !label.trim()} onClick={handleCreate}>
    Create
</Button>

// REQUIRED — single source of truth
const disabled = useMemo(
    () => loading || !name.trim() || !label.trim(),
    [loading, name, label]
)

const handleCreate = async () => {
    if (disabled) return
    // ...
}

<Button disabled={disabled} onClick={handleCreate}>
    Create
</Button>
```

Rules:

- The memo's dep array must list every input the expression reads.
- Reference implementation: `components/Sheet.jsx` (`RegisterNodeSheetContent` — `disabled` covers both the Create button and `handleCreate`'s guard).

---

## Icons

There are **two** kinds of icons in this repo, and they are not interchangeable. The default for any new code is the **`<Icon/>` Material Symbol wrapper** — reach for it first, every time.

### 1. Inline UI icons — `<Icon>` (Google Material Symbols Rounded) — DEFAULT

Use this for any in-flow icon (input adornments, button affordances, status dots, table actions, empty-state glyphs, info icons, chevrons, close `X`, etc.). **`<Icon/>` is the default — assume it covers the case unless you have a specific, justified reason otherwise.**

```jsx
import Icon from '@/components/Icon'

<Icon size="md" className="text-muted-foreground">search</Icon>
<Icon className="text-destructive">error</Icon>
<Icon>check</Icon>
<Icon size="sm" className="text-muted-foreground/70">info</Icon>
<Icon className="transition-transform group-data-[state=open]:rotate-180">expand_more</Icon>
```

Sizes: `xxs | xs | sm | md | default | lg | xl`. The child is the Material Symbol name (browse the catalog at <https://fonts.google.com/icons?icon.set=Material+Symbols>). The class string ends up as `material-symbols-rounded` and the font is loaded by the host page.

> **Tip — recolor / rotate / size from className.** Material Symbols inherit `currentColor`, so `text-foreground`, `text-muted-foreground`, `text-success`, etc. all work. Don't reach for SVG just because you want a colored icon.

### 2. Brand / navigation marks — SVG via `@svgr/webpack`

For the crest, logo, sidebar icons, decorative ripples, app-specific glyphs, etc. SVGs live in `src/assets/svg/` (and `src/assets/svg/icons/` for nav). SVGR is configured in `next.config.mjs` so a **default import is the React component** (every `.svg` in the repo is used this way — none are imported as URLs). **Always** import them as React components — never as `<img src="/svg/foo.svg" />`.

```jsx
import Crest from '@/assets/svg/crest.svg'
import HomeIcon from '@/assets/svg/icons/home.svg'
import Arrow from '@/assets/svg/icons/arrow.svg'

<Crest />
<HomeIcon className="mx-auto" />
<Arrow className="size-3" />
```

Use SVG only when the artwork is **brand-owned** (logos, marks, illustrations, custom navigation glyphs that have been hand-tuned for the design). If a Material Symbol exists for what you need, prefer the Material Symbol.

### 3. `lucide-react` — rare, justified exceptions only

`lucide-react` is a transitive dependency of shadcn's defaults. **Do not import from `lucide-react` in new code by default.** Treat it as a last resort for the rare case where:

- You're working inside an unmodified shadcn primitive in `components/ui/` that already imports lucide (don't rip it out unprovoked), **or**
- Material Symbols genuinely lacks a glyph for what you need *and* the artwork can't be expressed as a brand SVG.

In every other case — including new compositions in `components/`, pages, drawers, sheets, dropdowns, empty states — reach for `<Icon>name</Icon>` instead. If you find yourself typing `import { X, Search, ChevronDown } from 'lucide-react'` in new code, stop and rewrite as `<Icon>close</Icon>`, `<Icon>search</Icon>`, `<Icon>expand_more</Icon>`.

```jsx
// FORBIDDEN in new code
import { X, Search, ChevronDown, Trash2 } from 'lucide-react'

// REQUIRED
import Icon from '@/components/Icon'
<Icon>close</Icon>
<Icon>search</Icon>
<Icon>expand_more</Icon>
<Icon>delete</Icon>
```

> **Quick swap reference:** `X → close`, `Search → search`, `ChevronDown → expand_more`, `ChevronUp → expand_less`, `ChevronRight → chevron_right`, `ChevronLeft → chevron_left`, `Check → check`, `Plus → add`, `Minus → remove`, `Trash → delete`, `Pencil → edit`, `Info → info`, `AlertCircle → error`, `AlertTriangle → warning`, `Settings → settings`, `User → person`, `Home → home`, `MoreHorizontal → more_horiz`, `MoreVertical → more_vert`.

---

## Loading & Transitions

### Skeletons

- **Every named `*Skeleton` component lives in `components/Skeleton.jsx`**, whatever renders it. That file holds the primitive, one named component per surface (`FeedSkeleton`, `CommentsSkeleton`, `NotificationsSkeleton`, `CalendarSkeleton`, `SignupsSkeleton`, `RotaSkeleton`, `PeopleSkeleton`, `ProfileCardSkeleton`, `TableSkeleton`), and any geometry the real surface and its placeholder both read (`NOTIFICATION_ROW`, `USER_TABLE_COLUMNS`) so the two cannot drift a pixel apart. **A component file is no more exempt than a page is.** The point of the rule is that the app's skeletons are all in one place: one defined beside the surface it stands in for is one nobody looking in `Skeleton.jsx` will find, and one that quietly stops matching the surface it sits next to.
- **A bare `<Skeleton/>` inline is for a placeholder that stands in for one element, in place** — the in-flight upload tile in `<ComposeForm/>`, the date in `<PrologueTitle/>`, the fasting strip in `<SignupClaim/>`. A bar or two in the same ternary as the thing they replace, small enough that reading the swap means reading one screen. **The threshold is scale, not syntax** — a two-bar wrapper mirroring one line-pair is still in place; repeated rows, several regions, or a container the whole surface is laid out in is a surface skeleton. Name it and move it, because at that size the placeholder is carrying geometry the real surface also carries, and keeping those two in step is what `Skeleton.jsx` is for.
- **A blurred sample is the other placeholder, and it is deliberately narrow.** `<Blurred/>` (same file) holds a surface's *own shape* out of focus and brings it into focus when the answer lands. It suits a surface whose **shape is known before its content is**: the Daily Read (a title, then a page of prose under headings) and the Events calendar (a grid whose dates come from arithmetic, where only the rings need the request). Two things it requires: the caller renders the sample into the **same element** the answer will occupy, or there is no transition to run; and the sample is `aria-hidden` while it stands, because it is not true. A grey bar is still right where there is genuinely no shape yet — `<CalendarSkeleton/>` covers the frame before a month is even chosen — and for a list, where the rows *are* the information and there is no single answer to bring into focus.

  **The sample is the caller's, and what is in it is a decision.** The Daily Read's is filler prose (`SAMPLE_DAY` in `Prologue.jsx`) rather than an invented saint's life or passage of scripture: text that reads as the Church's while being nobody's does not belong in this repo, least of all on the surface whose point is that it carries somebody else's real words. Blurred, only the measure of the lines is doing any work anyway.
- Always render skeleton/content under an `<AnimatePresence mode="wait">`, with each branch wrapped in `<Transition fast key="...">`. This produces the standard fade between loading and loaded states:

```jsx
import { AnimatePresence } from 'motion/react'
import Transition from '@/components/Transition'
import { TableSkeleton } from '@/components/Skeleton'

<AnimatePresence mode="wait" initial={false}>
    {skeleton ? (
        <Transition fast key="skeleton">
            <TableSkeleton />
        </Transition>
    ) : (
        <Transition fast key="content">
            {/* ... real table */}
        </Transition>
    )}
</AnimatePresence>
```

- The `skeleton` flag comes from the hook, derived from readiness (`!ready`, or `items.length === 0` for a secondary resource) so it paints on the **first** frame and is only true on the first load — refreshes update silently. See the hook-layer section.
- Neither the store nor the hook adds a floor or a debounce (`useDelay` was removed). Deriving `skeleton` from readiness so it is truthy on the first render (see **The hook layer**) is what removes the flash; an artificial delay would only make every load slower.
- **A silent load has no skeleton at all.** When there is already a complete surface on screen — the post overlay, seeded from the feed's cached row — a background refresh must not cover it. Gate the skeleton on a readiness flag the cache can satisfy (`ready` in `lib/store/post/store.js`), not on the fetch being in flight.

### Page transitions

The **layout** owns the route cross-fade via `<PageTransition/>` (which wraps `AnimatePresence` + a keyed `motion.div` + `<FrozenRouter/>`) — see the Routing section. Page components do **not** add their own top-level transition. They may use `components/Transition.jsx` internally (as `group/users/page.jsx` does between skeleton/content).

### Spinners

Use `Spinner` from `components/Loading.jsx` (it's `assets/svg/spinner.svg` with an animation). Don't roll your own `border-t animate-spin` rings.

### Action buttons during async work — `<Ripple/>`

When a button kicks off an async store action (deploy, create, save, delete, etc.), **never** replace its label with a text placeholder like `"Loading..."`, `"Creating..."`, or `"Saving..."`. Swap the button's children for the animated ripple SVG instead. The label change is jarring, shifts the button width unpredictably, and is inconsistent with the rest of the app.

```jsx
import Ripple from '@/assets/svg/ripple.svg'

<Button
    type="button"
    size="lg"
    disabled={loading || !canSubmit}
    onClick={handleSubmit}
>
    {loading ? (
        <Ripple
            aria-label="Creating node"
            className="size-8 [&_circle]:stroke-current"
        />
    ) : (
        "Create New Node"
    )}
</Button>
```

Rules:

- The ripple lives at `src/assets/svg/ripple.svg` and is imported as a React component via SVGR (see `next.config.mjs`).
- Always size it with `size-8` (matches `<Button size="lg">`'s line height — pick a different `size-*` for `xs`/`sm` buttons by eyeballing the icon height against the button text).
- Always include `[&_circle]:stroke-current` so the ripple inherits the button variant's foreground color (works for `default`, `outline`, `ghost`, `destructive`, etc.).
- Always provide an `aria-label` that describes the in-flight action (e.g. `"Deploying"`, `"Creating node"`, `"Saving changes"`) — screen readers lose the visible button label while the ripple is shown.
- Keep `disabled={loading}` on the button so the user can't double-fire the action.
- Reference implementations: `components/Drawer.jsx` (Deploy button) and `components/Sheet.jsx` (Create New Node button).

---

## Conditional Rendering Style

Keep the render in a **single** return tree. Don't introduce early returns for loading/error/empty — use ternaries inside the JSX. The `AnimatePresence`/`Transition` pattern depends on the same parent being mounted across states.

```jsx
// FORBIDDEN
if (error) return <div className="text-destructive">{error}</div>
if (loading) return <Spinner />
return <Content data={data} />

// REQUIRED
return (
    <section>
        {loading ? (
            <Spinner />
        ) : error ? (
            <Icon className="-ml-1 text-destructive">error</Icon>
        ) : (
            <Icon className="-ml-1">check</Icon>
        )}
    </section>
)
```

---

## Entry Point Wiring

There is no `main.jsx`. Three files split the responsibilities the old `main.jsx` + `App.jsx` used to hold:

**`app/layout.jsx`** — the entry, a Server Component. Renders `<html>`/`<body>`, imports `globals.css` (which carries every `@font-face`), exports `metadata` (title + favicon), and mounts `<Providers>` + `<App/>`. `suppressHydrationWarning` on `<html>` is required by next-themes (it stamps the theme class before hydration — no manual no-flash script needed).

```jsx
// app/layout.jsx (essence)
export const metadata = { title: "Grapevine", icons: { icon: "/favicon.svg" } }

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body>
                <Providers>{children}</Providers>
                <App />
            </body>
        </html>
    )
}
```

**`app/providers.jsx`** (`"use client"`) — the context tree only: `next-themes` `ThemeProvider` (configured `attribute="class"`, `defaultTheme="dark"`, `enableSystem`, `storageKey="grapevine-ui-theme"`, `disableTransitionOnChange`) → `ScrollProvider` (shares the shell scroll container's ref + `scrollToTop`; the vibing/pull-to-refresh hooks in `lib/hooks/useScroll.hook.js` read that container), plus the global `<Toaster/>`.

**`app/App.jsx`** (`"use client"`, renders `null`) — the app-wide side effects, mounted explicitly by the layout so they're visible rather than buried in the provider tree. Because the stores are module-level Zustand (not React context), it doesn't need to sit inside any provider:

```jsx
"use client"
export default function App() {
    const initAuthorizedStores = useGlobalStore(state => state.initAuthorizedStores)
    const loggedIn = useAuthStore(state => state.loggedIn)
    useEffect(() => { if (loggedIn) initAuthorizedStores() }, [loggedIn, initAuthorizedStores])
    useErrorListener()
    return null
}
```

---

## Quick "Add a new domain" Checklist

Use this whenever you add a new top-level entity (e.g. `installs`, `users`, `releases`).

1. **API surface**
   - [ ] Add endpoints to `lib/constants.js` under `API_ENDPOINTS` (and `PAGE_SIZE` for a collection).
   - [ ] Add route paths to `ROUTES` (if the entity has pages).
   - [ ] Build the endpoints per `backend-architecture.md` (`route.api.js`, `{ items, nextCursor }`, `AppError`).
2. **Store + Hook**
   - [ ] `lib/store/<domain>/store.js` matching the template (`INIT`, `ready/loading/error`, `init/refresh/reset/clearErrors`, Immer).
   - [ ] `lib/store/<domain>/hook.js` exposing one hook per page use-case, using `useShallow` and exposing `skeleton`.
   - [ ] If the domain has both a **list** and an **open item**, that's two stores (`feed` + `post`), joined by a `cachedX`/`patchX` pair. Writes live with the item, not the list.
3. **Global wiring**
   - [ ] Import in `lib/store/global.store.js` and update `initAuthorizedStores` (skip it for a transient store), `reset`, `clearErrors`.
   - [ ] Import in `lib/store/global.hook.js` and update `useReady` and `useErrors`.
4. **Routing**
   - [ ] Add the route folder under `app/(protected)/<domain>/` with a `page.jsx` (and `[param]/page.jsx` for dynamic routes). No router config file to edit — the folder *is* the route.
   - [ ] Add a sidebar entry in `app/(protected)/layout.jsx` (`NAV` array) — provide an SVG icon in `assets/svg/icons/`.
5. **Skeletons**
   - [ ] Add named skeleton components / column configs to `components/Skeleton.jsx` — never beside the surface they stand in for.
6. **Pages**
   - [ ] `app/(protected)/<domain>/page.jsx` — start with `"use client"` — consuming the hook. No `fetch`, no direct store access, no inline error strings.
7. **shadcn primitives**
   - [ ] If a new primitive is needed, install it via `npx shadcn@latest add <name>` from the repo root.

If any one of these is missing, the new domain will not participate in the global ready/error/reset lifecycle and toasts will not surface its errors.
