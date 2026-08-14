# Frontend Architecture

This document describes the frontend architecture and the patterns ALL agents must follow. The frontend is the entire project — the app is rooted at the repo top level (single npm package). Follow these rules completely and do **not** take creative liberties outside their scope.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | **Next.js 15** (App Router) on **React 19** |
| Build / Dev Server | **Next.js** (`next dev` / `next build` / `next start`) |
| Rendering model | **Client-rendered SPA inside Next.** Pages/layouts are Client Components (`"use client"`); the mock stores, `motion`, and localStorage auth run entirely on the client. Next exists here for the Node server (route handlers / a future API), not for SSR/RSC data fetching. |
| Routing | **Next.js App Router** (`src/app/**`, file-based) + `next/navigation` + `next/link` |
| State Management | **Zustand 5** + **Immer** middleware |
| Forms | `react-hook-form` + `zod` (via `@hookform/resolvers`) |
| Styling | **Tailwind CSS v4** (via `@tailwindcss/postcss`) |
| Animation | `motion` (Framer Motion) |
| Theming | **`next-themes`** (class strategy, `storageKey` `synaxis-ui-theme`) |
| Auth gate | **`components/AuthGate.jsx`** reading the persisted store (mock auth) |
| Native shell | **Capacitor 8** (iOS + Android) over a static export — see `native-architecture.md` |
| Component Library | **shadcn/ui** (radix-ui primitives) — `components.json` at the repo root |
| Icons | **Google Material Symbols** via the local `<Icon>` component |
| SVG | **`@svgr/webpack`** (configured in `next.config.mjs`) — SVGs are imported as React components |
| Toasts | `sonner` |
| Drawers | `vaul` (wrapped by shadcn `drawer`) |
| Class Merging | `clsx` + `tailwind-merge` (re-exported as `cn()` in `@/lib/utils`) |

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
│   │   ├── providers.jsx            # "use client": next-themes ThemeProvider + Tooltip/Scroll + <Toaster/>
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
│   │       │   ├── layout.jsx       # Settings tabs + NESTED <PageTransition/> for sub-tabs
│   │       │   ├── page.jsx         # /settings (General)
│   │       │   └── users/page.jsx   # /settings/users
│   │       └── [...not-found]/page.jsx  # Catch-all → in-shell 404 (old `path: '*'`)
│   ├── globals.css                  # Tailwind v4 + theme tokens (only file to change theme vars)
│   ├── assets/
│   │   ├── fonts/
│   │   └── svg/                     # ALL svgs live here; imported as React components
│   │       └── icons/               # Sidebar/utility icons (still SVG, not Material)
│   ├── components/
│   │   ├── ui/                      # shadcn-generated primitives — DO NOT hand-edit
│   │   ├── Icon.jsx                 # Google Material Symbol wrapper
│   │   ├── Transition.jsx           # motion.div fade wrapper for AnimatePresence (skeleton/content swaps)
│   │   ├── PageTransition.jsx       # "use client": route cross-fade (AnimatePresence + FrozenRouter)
│   │   ├── FrozenRouter.jsx         # "use client": freezes LayoutRouterContext for exiting routes
│   │   ├── SlideRouter.jsx          # "use client": <SlideRouter/> (slide-route surface + registry)
│   │   │                            #   and <SlideBase/> (the base surface it pushes)
│   │   ├── Loading.jsx              # <Spinner/>, <LoadOverlay/> (moved out of the old pages/loading)
│   │   ├── Skeleton.jsx             # Skeleton primitive + named skeleton components
│   │   ├── Badge.jsx                # Branded badge; hashes color from text
│   │   ├── Hyperlink.jsx
│   │   ├── Breadcrumb.jsx
│   │   ├── Notifications.jsx
│   │   ├── Profile.jsx
│   │   ├── Pagination.jsx
│   │   ├── Widgets.jsx              # Reusable misc/branded widgets (e.g. <Close/>, <YayOrNay/>) — DRY home, never repeat misc components in pages
│   │   └── Grain.jsx
│   ├── lib/
│   │   ├── constants.js             # ROUTES, SLIDE_ROUTES, NESTED_TRANSITION_ROUTES, MOCK_LATENCY_MS
│   │   │                            #   (add API_ENDPOINTS/API_BASE when wiring a real API)
│   │   ├── mock.js                  # mockDelay / mockId — swap for real fetch when a backend lands
│   │   ├── utils.js                 # Shared pure helpers (cn, formatDate, appPath/basePath,
│   │   │                            #   route resolvers: slideRouteFor/baseRouteFor/…)
│   │   ├── metadata.js              # Static / mock metadata used while APIs are stubbed
│   │   ├── hooks/                   # Cross-cutting React hooks (not Zustand hooks)
│   │   │   ├── useDebounce.hook.jsx
│   │   │   ├── useNow.hook.jsx
│   │   │   ├── useSlideRoute.hook.js  # Interceptor ↔ shell bridge for slide routes
│   │   │   ├── useScroll.hook.js      # scrollToTop + useScrollLock + useVibing + usePullToRefresh
│   │   │   └── useErrorListener.hook.jsx
│   │   ├── providers/
│   │   │   ├── Theme.jsx            # Thin re-export of next-themes ThemeProvider/useTheme
│   │   │   ├── Tooltip.jsx          # re-exports shadcn TooltipProvider
│   │   │   └── index.jsx            # barrel (ThemeProvider, TooltipProvider)
│   │   └── store/                   # Zustand stores (one folder per domain)
│   │       ├── global.store.js      # Orchestrates init/reset/clearErrors across stores
│   │       ├── global.hook.js       # useErrors() aggregator (+ useReady() when stores grow)
│   │       ├── auth/                # { store.js, hook.js }
│   │       └── app/                 # { store.js, hook.js }
```

> **Note:** entry wiring lives in `app/layout.jsx` + `app/providers.jsx`, and routing is the App Router `app/**` segments — there is no `main.jsx` or router config file. The `apps/nodes/events` domains referenced elsewhere in this doc are illustrative templates for the store/hook pattern — this repo currently ships only the `auth` and `app` stores.

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

Single static class with `get` / `post` / `put` / `delete`. It throws on non-OK responses so stores can use `try/catch`.

```javascript
import { API_BASE, API_ENDPOINTS } from "@/lib/constants";

class API {
    static async grab(method, endpoint, body = {}, options = {}) {
        const { params, raw, ...rest } = options
        const url = API_BASE + endpoint + (params ? "?" + new URLSearchParams(params).toString() : "")

        const res = await fetch(url, {
            method: method.toUpperCase(),
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            ...rest,
            ...(body ? { body: JSON.stringify({ ...body }) } : {})
        })
        if (raw) return res

        const json = await res.json()
        if (!res.ok || (json.success === false && json.errors?.length > 0)) {
            throw json.errors || []
        }
        return json
    }
    static get(endpoint, options = {}) { return this.grab("get", endpoint, null, options) }
    static post(endpoint, body = {}, options = {}) { return this.grab("post", endpoint, body, options) }
    static put(endpoint, body = {}, options = {}) { return this.grab("put", endpoint, body, options) }
    static delete(endpoint, options = {}) { return this.grab("delete", endpoint, null, options) }
}

export default API
```

All routes and endpoints live in `lib/constants.js`:

```javascript
export const ROUTES = {
    DEFAULT: "/",
    APPS: "/apps",
    APP: "/apps/:app",
    NODES: "/nodes",
    EVENTS: "/events",
    PUBLIC: { LOGIN: "/login", SIGNUP: "/signup" }
}

export const API_ENDPOINTS = {
    LOGIN: "/auth/login",
    LOGOUT: "/auth/logout",
    ME: "/users/me",
}

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/emc/api/v1"
```

> **Env vars:** under Next, anything read in browser/client code must be prefixed `NEXT_PUBLIC_` and accessed via `process.env.NEXT_PUBLIC_*` (there is no `import.meta.env`). Server-only route handlers may read unprefixed vars. When a real API lands it can be a Next **route handler** under `src/app/api/**/route.js` — that's the Node server this migration unlocks.

Never hard-code URLs or paths in stores/components — extend these maps.

---

## State Management — Zustand + Immer

### The store template

Every domain store lives at `lib/store/<domain>/store.js` and follows this exact shape. The keys `ready`, `loading`, `error`, plus the actions `init`, `refresh`, `reset`, `clearErrors`, are required so the global aggregator can talk to it.

```javascript
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import api from '@/lib/api'
import { mockDelay } from '@/lib/mock'
import { API_ENDPOINTS, MOCK_LATENCY_MS } from '@/lib/constants'

const ERROR_INIT = {
    list: false,
    detail: false,
}

const LOADING_INIT = {
    list: false,
    detail: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    items: [],
    current: null,
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
        try {
            set(state => { state.loading.list = true })
            // Race the fetch against a floor so the skeleton is always visible for at
            // least MOCK_LATENCY_MS (see the hook-layer section). In the mock app the
            // fetch is `Promise.resolve(SEED)`; both forms take the same shape.
            const [res] = await Promise.all([
                api.get(API_ENDPOINTS.ITEMS),
                mockDelay(MOCK_LATENCY_MS),
            ])
            const items = res?.data || []
            set(state => {
                state.items = items
                state.ready = true
            })
        } catch (error) {
            set(state => { state.error.list = error })
        } finally {
            set(state => { state.loading.list = false })
        }
    },

    setCurrent: (slug) => set(state => {
        state.current = state.items.find(i => i.slug === slug) ?? null
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
- **One `ready` per store, not per resource.** `ready` exists solely to gate the store's `init()` (the primary boot fetch). Do **not** add parallel `xxxReady` flags for secondary resources. For a secondary resource's `skeleton`, gate on the *data being empty*: `skeleton = items.length === 0`. Because a loaded list is never empty, emptiness is a reliable "not loaded yet" signal, so the skeleton **paints on the very first frame** and clears once data arrives; a background refetch keeps the list populated, so it never re-flashes. Example: `auth` holds the primary `user` (gated by `ready`) plus a secondary `users` list whose hook (`useAdmin`) exposes `skeleton = users.length === 0`. (If a resource can legitimately be empty when loaded, add a small `xxxReady` boolean the fetch sets instead — see the `comments` thread's `commentsReady` in `lib/store/feed/store.js`.)
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

### The hook layer

Every store has a matching `hook.js` that components consume. Hooks are the **only** thing components touch.

Three non-negotiable patterns inside hooks:

1. **`useShallow` for multi-selectors.** Pull every value you need in one selector so the component re-renders on shallow changes only.
2. **Initial-load gate via `skeleton`, derived so it paints on the first frame.** Expose a `skeleton` flag derived straight from readiness — `skeleton = !ready` for a primary load, `skeleton = items.length === 0` for a secondary resource. Both are already truthy on the component's very first render (the store boots `ready: false` / `items: []`), so the skeleton is present on frame one rather than fading in a beat late. Once loaded, `ready`/data stays truthy, so refreshes never re-flash it. **Do not** derive it as `!ready && loading` — `loading` is false until the fetch effect runs *after* the first paint, which produces the no-skeleton → fade-in → fade-out flash.
3. **Floor the load in the store, don't debounce in the hook.** A guaranteed-visible skeleton needs a minimum on-screen duration. Enforce it in the store action by racing the fetch against a floor delay with `Promise.all`, so the load never resolves faster than `MOCK_LATENCY_MS` (`lib/constants.js`, currently 1000ms):

   ```javascript
   const [res] = await Promise.all([
       api.get(API_ENDPOINTS.ITEMS),   // mock: Promise.resolve(SEED.slice(...))
       mockDelay(MOCK_LATENCY_MS),
   ])
   ```

   Because the skeleton is always on long enough to read, there is **no** sub-perceptual flash to debounce away — hooks must **not** wrap the flag in a delay/debounce. (The old `useDelay` wrapper is gone; deriving the flag per rule 2 plus this store-side floor replaces it.)

```javascript
import { useShallow } from 'zustand/react/shallow'
import { useEffect, useMemo } from 'react'
import useAppStore from './store'

export const useApps = () => {
    const [items, ready, init] = useAppStore(
        useShallow(state => [state.items, state.ready, state.init])
    )

    useEffect(() => { init() }, [init])

    /* Painted on the first frame; cleared once ready. The store floors the load at
     * MOCK_LATENCY_MS (Promise.all), so no debounce is needed to avoid a flash. */
    const skeleton = !ready

    return useMemo(() => ({ items, skeleton }), [items, skeleton])
}

export const useApp = (slug) => {
    const [current, setCurrent, ready, init] = useAppStore(
        useShallow(state => [state.current, state.setCurrent, state.ready, state.init])
    )

    useEffect(() => { init() }, [init])
    useEffect(() => {
        if (ready && slug) setCurrent(slug)
    }, [slug, ready, setCurrent])

    return useMemo(() => ({ current }), [current])
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
| `SLIDE_ROUTES` | Routes that open as a sliding overlay over a base surface that stays mounted (currently `/p`). See **Slide routes** below. |

| Resolver (`lib/utils.js`) | Answers |
|---|---|
| `slideRouteFor(pathname)` | The matched slide route + its dynamic `param`, or `null`. |
| `baseRouteFor(pathname)` | The route the shell should behave as if it's on (a slide route → its base). |
| `pageTransitionKey(pathname)` | The key for the top-level `<PageTransition/>`. |
| `isRouteActive(pathname, href)` | Whether a nav destination reads as current. |

Page components do **not** add their own top-level `PageTransition` — the layout owns it. They may still use `components/Transition.jsx` internally for skeleton/content swaps (see the settings/users table).

> **`eslint`:** `FrozenRouter` reads a ref during render on purpose; `react-hooks/refs` is disabled for it in `eslint.config.js`. Don't re-enable it there.

### Slide routes — `<SlideRouter/>` (overlay routes that push the page behind them)

A **slide route** is a real, shareable URL that, when reached by a soft nav from inside the app, opens as a full-screen surface sliding in from the right while the page behind it stays mounted and is pushed off to the left. Dismissing reverses it. The same URL opened cold (hard nav / refresh / a shared link) renders as an ordinary standalone page instead. `/p/:id` (a post) is the reference implementation.

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

> **History note.** This replaced an `@modal/(.)p/[postId]` intercepting route, which held the base mounted by asking Next to intercept. `output: "export"` — the native build, see `native-architecture.md` — rejects intercepting routes outright. The shallow version is also simpler: no parallel slot, no `default.jsx`, no interceptor page, and none of the slot-teardown hazards those carried.

`<SlideBase/>` is the other half: it wraps the shell's page (an ordinary flow element — see **Scrolling** below) and drives the coupled push. It slides only on mobile — desktop presents slide routes as a centered dialog over a still base. Because the document keeps its scroll offset through a pure horizontal transform, and the surface freezes the document while it's up, the base is exactly where the reader left it on dismiss.

`<SlideRouter/>` (mounted last in `app/(protected)/layout.jsx`) owns the surface, inside the layout's own `AnimatePresence`. Living in the persistent layout is what lets `AnimatePresence` retain the element — props and all — through the exit, so the surface keeps the param it opened with and never blanks mid-animation.

#### Open/close gating

`useActiveSlide()` reports `open` only when **both** are true:

- the **pathname** matches a registered slide route, and
- that exact path is the one **the app itself opened** (`openedPath`, module-level state in `useSlideRoute.hook.js`).

Both halves are load-bearing. The `openedPath` half is the **soft- vs cold-load signal**: a cold load of `/p/:id` (a shared link, or the standalone page) has a matching pathname but nothing mounted behind it, so it must render as an ordinary page rather than an overlay. The pathname half closes the surface the moment the URL moves anywhere else — dismissal or a tap on another nav tab — with nothing to reset, which is why `openedPath` stores the path rather than a boolean.

#### Adding a new slide route

Say you want `/u/:handle` (a profile) to slide over the feed. Four small, declarative steps — **no existing route is affected**, because everything keys off the registry and non-registered paths fall through every resolver unchanged:

1. **Register the route** in `lib/constants.js`:

   ```javascript
   export const ROUTES = { /* … */ USER: "/u" }

   export const SLIDE_ROUTES = [
       { prefix: ROUTES.POST, base: ROUTES.DEFAULT },
       { prefix: ROUTES.USER, base: ROUTES.DEFAULT },   // ← base = the surface it overlays
   ]
   ```

   This alone makes the top-level `<PageTransition/>` stop cross-fading the base, and keeps the base's nav tab highlighted while the surface is open.

2. **Build the surface** as a normal component (e.g. `components/UserView.jsx`) taking a `variant` (`"modal"` | `"page"`) and its param. It owns its own presentation *and* its own enter/exit animation, so it can differ by breakpoint. For the mobile push, animate `x: "100%" → 0` (and `exit: { x: "100%" }`) with `SLIDE_TRANSITION` from `@/lib/utils`, full-viewport wide — that's the contract that keeps it locked to `<SlideBase/>`. Model it on `components/PostView.jsx`.

3. **Register the surface** in `components/SlideRouter.jsx`:

   ```jsx
   const SURFACES = {
       [ROUTES.POST]: (param) => <PostView variant="modal" postId={param} />,
       [ROUTES.USER]: (param) => <UserView variant="modal" handle={param} />,
   }
   ```

4. **Add the standalone page** that serves the same URL when it's opened cold. Because the app is statically exported, a dynamic segment **must** enumerate its paths, which means this file is a Server Component (no `"use client"`) so it can export `generateStaticParams`:

   ```jsx
   // app/(protected)/u/[handle]/page.jsx — the cold deep link
   import UserView from "@/components/UserView"
   import { userHandles } from "@/lib/metadata"

   export const generateStaticParams = () => userHandles().map((handle) => ({ handle }))

   const UserPage = async ({ params }) => {
       const { handle } = await params
       return <UserView variant="page" handle={handle} />
   }
   ```

   The `page` variant portals to `<body>` (see `PostView`) so it escapes the shell's `z-1` page wrapper — which a slide route may be mid-transform on — and covers the viewport.

5. **Open it with `openSlide`** from the trigger (see `Feed.jsx`'s `openPost`), not `router.push`.

Nothing in `app/(protected)/layout.jsx` changes — it already renders `<SlideRouter/>` generically.

#### Rules

- **Never** re-derive slide-route behaviour inline (`pathname.startsWith("/p/")`) in a component. Use the resolvers, or add to the registry.
- **Never** open one with `router.push` — that unmounts the base and the push has nothing to slide.
- Keep the surface and `<SlideBase/>` on the **same distance, curve, and trigger**. If you change one, change the other; if they diverge, the push decouples.
- Give the surface a stable key across open→dismiss (handled for you by `SlideRouter`, which keys off the route prefix) so `AnimatePresence` tracks a single instance rather than remounting it.

### Route guards — `components/AuthGate.jsx`

Auth redirects are done by two client wrapper components, each applied once at the top of its route group's layout:

```jsx
// app/(protected)/layout.jsx        // app/(public)/layout.jsx
<ProtectedGate>{/* shell */}</ProtectedGate>   <PublicGate>{children}</PublicGate>
```

Each reads `useAuthed()` (the persisted `loggedIn`), waits for `useMounted()` so the `localStorage` value has rehydrated, then redirects on a mismatch and renders `null` until it is satisfied — so protected content is never painted for a signed-out visitor.

**This is deliberately not middleware.** `src/middleware.js` used to do it, gating on a `synaxis-auth` cookie, and that is the idiomatic Next approach — but `output: "export"` (the native build) drops middleware silently, so the gate would vanish precisely where it matters. A client gate is the one form that works in both build targets. The cost is that the decision lands after mount rather than before the response; the `mounted` gate is what keeps that from flashing.

Full detail, and how to attach a real session, is in `auth-architecture.md`.

### Role-gated visibility (`<Privileged/>`, `<PrivilegedRoute/>`)

> **Forward-looking:** role gating (`Privileged`, `PrivilegedRoute`, `ROLES`, `ROLE_LEVEL`) is not yet built in this slimmed repo. When you add roles, recreate `components/Auth.jsx` as the home for these client-side visibility helpers; route-level protection belongs alongside the gates in `components/AuthGate.jsx`. The pattern below is the intended convention.

Roles are hierarchical (`BASIC` < `ADMIN` < `PROVISIONER`; compare via `ROLE_LEVEL` in `lib/constants.js`). Use the helpers in `components/Auth.jsx`:

- **`<Privileged role={…}>`** — inline UI (buttons, tabs, table actions). Renders children when the current user's role meets or exceeds `role`; otherwise renders `fallback` (default `null`, i.e. hidden).
- **`<PrivilegedRoute role={…}>`** — whole routes. Redirects unauthorized users instead of hiding content.

**Visibility convention — follow this whenever you gate UI above `ROLES.BASIC`:**

| Required role | Basic user | Admin | Provisioner |
|---------------|------------|-------|-------------|
| `ROLES.ADMIN` | **hidden** | visible | visible |
| `ROLES.PROVISIONER` | **hidden** | **disabled** (`disabled`) | visible |

- **Basic users** must not see admin- or provisioner-only affordances — omit `disabled` so unauthorized users get `fallback` (hidden).
- **Admins** may see provisioner-only (or any role above theirs) affordances as **disabled** — pass `disabled` on `<Privileged>` so the control stays visible but dimmed and non-interactive (`opacity-50`, `pointer-events-none`). This signals that the action exists at a higher privilege level without granting access.
- **Provisioners** see everything their role allows normally (no `disabled` needed for their own tier).

```jsx
import { Privileged } from '@/components/Auth'
import { ROLES } from '@/lib/constants'

/* Admin-only — hidden from basic users */
<Privileged role={ROLES.ADMIN}>
    <Button onClick={handleDelete}>Delete</Button>
</Privileged>

/* Provisioner-only — hidden from basic, disabled for admins */
<Privileged role={ROLES.PROVISIONER} disabled>
    <Button onClick={handleProvision}>Provision...</Button>
</Privileged>
```

Reference: `components/Auth.jsx` (`Privileged`, `PrivilegedRoute`), `pages/nodes/[node]/page.jsx` (`ProvisionNodeAction` — provisioner CTA with `disabled`).

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

**The document is the app's only scroller.** There is no full-height inner container: the shell's page wrapper is an ordinary flow element inset past the rail (`md:pl-(--nav-width)`), so its height is its content's height and `<html>` is what scrolls.

This is not cosmetic. A mobile browser only retracts its own URL bar and toolbar when the *document* scrolls, so an inner scroll container permanently pins the app to the small viewport (`svh`) — visibly less room on a phone. It is also the only model a Capacitor WebView handles natively.

Rules that follow from it:

- **Never add a viewport-height scroll container** (`h-screen overflow-y-auto`, `h-dvh overflow-auto`) around page content. Inner scrollers are fine for *bounded* panels — a comment thread, a dropdown, a popover list — and those should carry `overscroll-contain` so hitting their end doesn't chain out to the page.
- **Prefer `dvh` over `vh`.** `vh` is the tall viewport on mobile, so anything sized in `vh` hides under the browser's own chrome.
- **Chrome is `fixed`, content is in flow.** The rail, the mobile bar, the grain, and the background gradient are fixed siblings in the root stacking context (z: backdrop 0, page 1, rail 2, grain 10, mobile bar 20, overlays 50). Nothing wraps them in a sized box.
- **Read scroll via framer-motion, not a hand-rolled listener.** The mobile bar dims out while scrolling down and reappears on scroll up via `useVibing` (`lib/hooks/useScroll.hook.js`), which is built on framer-motion's `useScroll` + `useMotionValueEvent` — event-driven, no `scroll` listener and no timer. Reach for `useScroll` for any new scroll-position UI.
- **Any surface that covers the page must call `useScrollLock`** (from `lib/hooks/useScroll.hook.js`). Otherwise the page keeps scrolling behind it and you get two live scrollbars. The lock is counted, so nested overlays are safe, and it holds for the component's whole life — under `AnimatePresence` that spans the exit animation, so scrolling returns only once the surface is gone. Radix and Vaul guard `<body>`, not the document, so their overlays need it too (see `CommentsDrawer`).
- **Pull-to-refresh is hand-built, not native.** `<html>` pins `overscroll-behavior: none`, which kills the browser's rubber-band *and* its built-in pull-to-refresh so the app can own the gesture identically in a browser and the Capacitor WebView (which has no native pull-to-refresh). `usePullToRefresh(onRefresh)` (`lib/hooks/useScroll.hook.js`) hangs non-passive touch listeners off the window — the only way to `preventDefault` the drag — and only claims a clear downward pull that starts at the very top with no overlay locked; anything else (scroll, horizontal carousel swipe) goes back to the browser. The `<PullToRefresh>` component wraps a page's content, translating it down and riding the ripple loader in the gap above (mobile/touch only — a mouse never fires it). It's wired on the home feed (`(protected)/page.jsx`); `onRefresh` should return the store's `refresh` promise.
- **`<html>` reserves its scrollbar gutter unconditionally** (`scrollbar-gutter: stable`), which is what lets the lock flip `overflow` to `hidden` without the page shifting sideways. Don't remove it.
- **Navigate with `scroll: false`.** `<Link scroll={false}>` / `router.push(path, { scroll: false })`. The layout scrolls to top itself from `PageTransition`'s `onExitComplete`, once the cross-fade has played; Next's own scroll fires up front and yanks the outgoing page.

### Safe areas

`viewport-fit=cover` is set in the root layout's `viewport` export, so `env(safe-area-inset-*)` reports real values on notched devices and in the Capacitor WebView. They are exposed as `--safe-top` / `--safe-right` / `--safe-bottom` / `--safe-left` in `globals.css`, plus `--bottombar` (the mobile rail's height *including* the home-indicator inset).

Anything that hugs a screen edge pads by these — use `pb-(--safe-bottom)`, `pt-(--safe-top)`, and clear the mobile rail with `--bottombar` rather than `--bottombar-height`.

---

## Styling & Theming (Tailwind v4)

### Hard rules

- **Tailwind v4** is configured via `@tailwindcss/postcss` (see `postcss.config.mjs`). All theme variables live in `src/globals.css` under `@theme`, `:root`, and `.dark`. **Do not change CSS variables unless the task explicitly asks for a theme change.**
- **`@utility` declarations** in `globals.css` (e.g. `panel`, `bg-dotted`) are off-limits unless the user explicitly asks.
- **No inline color literals** in `className`. Forbidden: `bg-[#ABCDEF]`, `text-[oklch(...)]`. Use theme tokens (`bg-primary`, `text-muted-foreground`, `border-border`, `text-success`, `text-warning`, `text-destructive`).
- **No `style={{...}}` prop** unless Tailwind genuinely can't express it. Always prefer string className.
- **Dark mode** is class-based (`.dark` on `<html>`), driven by **`next-themes`** (configured in `app/providers.jsx`, `localStorage` key `synaxis-ui-theme`). Use `dark:` variants in className. For runtime theme changes use `useTheme()` imported from `@/lib/providers/Theme` (a thin re-export of next-themes) — **never** roll your own. When rendering UI that depends on the *current* theme value (e.g. a theme switcher's active state), gate it on a `mounted` flag (`useEffect(() => setMounted(true), [])`) — next-themes returns the theme only after mount, so reading it during render without the gate causes a hydration mismatch (see `settings/page.jsx`).

### Layout tokens

Layout sizes are exposed as CSS variables in `globals.css`:

```
--nav-width        92px
--topbar-height    92px
--bumper           16px
```

Use them via Tailwind v4 arbitrary value syntax with the variable form: `w-(--nav-width)`, `h-(--topbar-height)`, `left-(--nav-width)`, `top-(--bumper)`. **Never** copy the literal pixel value into a class.

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

- All shadcn primitives live in `src/components/ui/`.
- **Do not hand-edit anything in `components/ui/`.** Add new primitives via the CLI from the repo root:

  ```bash
  npx shadcn@latest add <component>
  ```

- Compositions, branded skins, and feature-specific widgets go in **`src/components/`** (PascalCase), and they may import from `components/ui`. Examples in this repo:
  - `components/Drawer.jsx` — feature drawer that composes `components/ui/drawer.jsx`.
  - `components/Profile.jsx` — composes `components/ui/popover` + `components/ui/button`.

### Buttons

Use `<Button variant="..." size="...">` from `components/ui/button.jsx`. Variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`. Sizes: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. Don't create alternate buttons.

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

// settings/users/page.jsx
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

Use `react-hook-form` + `zod` + the shadcn `Form`/`FormField`/`FormControl`/`FormMessage` wrappers (see `pages/public/login/page.jsx`):

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

- Wrap skeletons in named components in `components/Skeleton.jsx` (e.g. `HeaderSkeleton`, `TableSkeleton`, `VERSION_TABLE_COLUMNS`). **Avoid using the bare `<Skeleton/>` directly in pages** — extract a named component if you find yourself composing rows of skeletons inline.
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
- Guaranteeing the skeleton stays on long enough to read is the **store's** job, not the hook's: the fetch is raced against a `mockDelay(MOCK_LATENCY_MS)` floor via `Promise.all`. There is no hook-side debounce (`useDelay` was removed) — with a floored load there is no sub-perceptual flash to suppress.

### Page transitions

The **layout** owns the route cross-fade via `<PageTransition/>` (which wraps `AnimatePresence` + a keyed `motion.div` + `<FrozenRouter/>`) — see the Routing section. Page components do **not** add their own top-level transition. They may use `components/Transition.jsx` internally (as `settings/users/page.jsx` does between skeleton/content).

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

**`app/layout.jsx`** — the entry, a Server Component. Renders `<html>`/`<body>`, imports `globals.css`, adds the Material Symbols `<link>`, exports `metadata` (title + favicon), and mounts `<Providers>` + `<App/>`. `suppressHydrationWarning` on `<html>` is required by next-themes (it stamps the theme class before hydration — no manual no-flash script needed).

```jsx
// app/layout.jsx (essence)
export const metadata = { title: "Synaxis", icons: { icon: "/favicon.svg" } }

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>{/* Material Symbols <link> */}</head>
            <body>
                <Providers>{children}</Providers>
                <App />
            </body>
        </html>
    )
}
```

**`app/providers.jsx`** (`"use client"`) — the context tree only: `next-themes` `ThemeProvider` (configured `attribute="class"`, `defaultTheme="dark"`, `enableSystem`, `storageKey="synaxis-ui-theme"`, `disableTransitionOnChange`) → `TooltipProvider`, plus the global `<Toaster/>`. (There is no scroll provider — the document is the scroller, so scroll helpers are plain functions/hooks in `lib/hooks/useScroll.hook.js`.)

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
   - [ ] Add endpoints to `lib/constants.js` under `API_ENDPOINTS`.
   - [ ] Add route paths to `ROUTES` (if the entity has pages).
2. **Store + Hook**
   - [ ] `lib/store/<domain>/store.js` matching the template (`INIT`, `ready/loading/error`, `init/refresh/reset/clearErrors`, Immer).
   - [ ] `lib/store/<domain>/hook.js` exposing one hook per page use-case, using `useShallow` and exposing `skeleton`.
3. **Global wiring**
   - [ ] Import in `lib/store/global.store.js` and update `initAuthorizedStores`, `reset`, `clearErrors`.
   - [ ] Import in `lib/store/global.hook.js` and update `useReady` and `useErrors`.
4. **Routing**
   - [ ] Add the route folder under `app/(protected)/<domain>/` with a `page.jsx` (and `[param]/page.jsx` for dynamic routes). No router config file to edit — the folder *is* the route.
   - [ ] Add a sidebar entry in `app/(protected)/layout.jsx` (`NAV` array) — provide an SVG icon in `assets/svg/icons/`.
5. **Skeletons**
   - [ ] Add named skeleton components / column configs to `components/Skeleton.jsx`.
6. **Pages**
   - [ ] `app/(protected)/<domain>/page.jsx` — start with `"use client"` — consuming the hook. No `fetch`, no direct store access, no inline error strings.
7. **shadcn primitives**
   - [ ] If a new primitive is needed, install it via `npx shadcn@latest add <name>` from the repo root.

If any one of these is missing, the new domain will not participate in the global ready/error/reset lifecycle and toasts will not surface its errors.
