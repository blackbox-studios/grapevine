# Native Architecture (Capacitor)

> **Purpose.** How Synaxis ships as an iOS/Android app through Capacitor, and the
> constraints that shape the web code because of it. Read this before touching
> `next.config.mjs`, `src/app/layout.jsx`, the auth gate, or anything under `android/`
> and `ios/`.
>
> Companion docs: `frontend-architecture.md` (patterns the app follows) and
> `auth-architecture.md` (why the gate is a client component).

---

## TL;DR

- The native app is the **same web app**, exported to static files and served from
  inside a WebView. There is no native UI layer and no React Native.
- **Two build targets** from one codebase:
  - `npm run build` → Node server (`next start`). Keeps route handlers, so this is
    the target for a real `/api`.
  - `npm run build:native` → `output: "export"` static bundle in `out/`, which is
    what Capacitor packages.
- `output: "export"` **forbids** middleware and intercepting routes. Both were used
  before; both were replaced with client-side equivalents (see below).
- Every route must be statically enumerable, so dynamic segments need
  `generateStaticParams`.
- The app must run with **no network at all** — assets, fonts, and icons are bundled.

---

## Commands

```bash
npm run build:native   # static export → out/ (sets NEXT_PUBLIC_NATIVE=1)
npm run sync           # build:native + cap sync (copy web assets + update plugins)
npm run ios            # sync + open Xcode
npm run android        # sync + open Android Studio
```

`cap sync` copies `out/` into `android/app/src/main/assets/public` and
`ios/App/App/public`, and regenerates the plugin registry. **Re-run `npm run sync`
after any web change** — the native projects hold a *copy*, not a live reference.

Config lives in `capacitor.config.json` (`webDir: "out"`, background colors, and the
SplashScreen / StatusBar / Keyboard plugin options).

---

## The one constraint that shapes everything

**Capacitor serves `index.html` for every path without a file extension.**

- iOS: unconditional — `CapacitorRouter.route` returns `index.html` whenever the path
  has no extension.
- Android: the same, whenever `server.html5mode` is on (the default).

So the per-route HTML files Next exports (`out/settings.html`, `out/p/post-001.html`)
are **never used by the native app**. They exist for the web deploy. Natively, every
URL is served the *root* document.

That has a sharp consequence: if the WebView ever boots at a non-root URL — a reload,
a restored session, a future deep link — it gets the root document (the feed) while
`location.pathname` still says `/settings`. The router then paints the feed under the
wrong URL, and nav highlighting and back behaviour go with it.

**The fix** is a synchronous guard in `<head>` in `src/app/layout.jsx`: on native only,
rewrite the URL to the root before hydration, so the URL and the served document agree.

```js
// src/app/layout.jsx (essence) — runs before the framework chunks
if (isNativePlatform() && location.pathname !== "/") history.replaceState(null, "", "/")
```

Three details are load-bearing:

- **`<head>`, not `<body>`.** Next's chunks ship as `async` scripts, which can execute
  before a `<body>` script is parsed. In `<head>` the guard is guaranteed to run before
  the first RSC payload chunk, and therefore before the router reads the URL.
- **Not `next/script`.** `strategy="beforeInteractive"` compiles to a
  `self.__next_s.push(...)` entry that Next's own runtime executes — too late. Use a
  plain `<script>`.
- **Native only.** On the web each route exports its own HTML, so deep links must keep
  resolving. The guard checks the Capacitor bridge (injected into `<head>` before any
  page script) and the `capacitor:` scheme.

If you add native deep links later, capture the incoming path in that guard and replay
it after mount (via `openSlide` for a slide route) instead of discarding it.

---

## What static export forced to change

| Was | Now | Why |
|---|---|---|
| `src/middleware.js` gating routes on a cookie | `<ProtectedGate>` / `<PublicGate>` in `components/AuthGate.jsx` | `output: "export"` drops middleware silently — there is no server to run it |
| `@modal/(.)p/[postId]` intercepting route | `history.pushState` in `useSlideRoute.hook.js` | Export rejects intercepting routes outright |
| Material Symbols from `fonts.googleapis.com` | self-hosted `@font-face` in `globals.css` | A CDN font renders as text on a cold offline launch |
| `/p/[postId]` as a Client Component | Server Component exporting `generateStaticParams` | Export must know every path up front |

Details for the first two live in `auth-architecture.md` and the **Slide routes**
section of `frontend-architecture.md`.

---

## Adding a library — read this before following any vendor quickstart

Almost every Next.js integration guide (Supabase, NextAuth/Auth.js, Clerk, Stripe) is
written for a **Node-server Next app**. This app also has to run as a static bundle in a
WebView with no server of its own, so parts of those guides don't apply. Following one
verbatim is the most likely way to break the native build.

**The dangerous part is that the most common breakage is silent.** Next does not error
when it finds a `middleware.js` under `output: "export"` — it just doesn't include it.
The web build keeps working, the native build compiles, `cap sync` succeeds, and the app
ships with **no auth gate at all**. Compare that with intercepting routes, which fail
loudly at build time. Assume nothing about middleware is enforced; there is no server in
the native app for it to run on.

### Never add these

| Do not add | Why | Do this instead |
|---|---|---|
| `src/middleware.js` | Silently dropped by `output: "export"`. No error, no gate. | Put the check in `<ProtectedGate>` / `<PublicGate>` (`components/AuthGate.jsx`) |
| Server Components that fetch, `cookies()`, `headers()` | No request context at export time | Fetch from a store, read the session client-side |
| Server Actions | Need a running server to POST back to | A normal `fetch` to your deployed API |
| Route handlers the native app depends on (`src/app/api/**`) | Not emitted into the static bundle | Deploy the API separately; call it by absolute URL |
| Intercepting / parallel routes (`@slot`, `(.)path`) | Rejected by the export | Shallow history — see **Slide routes** |
| `rewrites`, `redirects`, `headers` in `next.config.mjs` | Server features; ignored in an export | Handle in the client, or at your web host for web only |
| `next/image` optimization | No optimizer process | Already forced to `images: { unoptimized: true }` |

Route handlers under `src/app/api/**` are still fine for the **web** target — that's why
the dual build exists. Just never let the native app's behaviour depend on them.

### Concretely: what "add Supabase auth" should look like

Supabase's Next.js guide is built around `@supabase/ssr`: a `createServerClient`, a
`middleware.ts` that refreshes the session cookie on every request, and server-side
`getUser()` calls. **None of that survives the native build.** Use the browser client
instead and keep the existing shape:

- **Client only.** `createBrowserClient` (or plain `supabase-js`). It persists the
  session to `localStorage` and refreshes tokens itself — which is exactly the model the
  app already uses, so no middleware is needed to keep a session alive.
- **Keep the gate.** `onAuthStateChange` sets `loggedIn` / `user` in the auth store; the
  gates in `AuthGate.jsx` keep doing the redirecting. Do not move route protection into
  a server file.
- **The store stays the seam.** Replace the mock body of `store.login` / `store.logout`.
  Consumers (`useUser`, the gates) should not change. See `auth-architecture.md`.
- **OAuth on native is a different flow.** A native WebView has no origin a provider can
  redirect back to, so the web redirect flow does not work. It needs a deep link:
  a custom URL scheme plus the Capacitor `Browser`/`App` plugins to catch the callback.
  Email/password and magic links are far less work if you don't need social login.

The same reasoning applies to any auth vendor: **anything that needs a server per request
cannot be part of the native app's critical path.**

### Review checklist

Before merging a dependency that touches routing or auth, confirm: `npm run build:native`
still succeeds, `out/` contains the routes you expect, and signing out still redirects on
the native bundle (not just in `next dev`, which runs middleware and serves per-route
HTML and therefore hides both classes of bug).

---

## Dynamic routes at scale (thousands of posts)

Short answer: **fetching thousands of posts at runtime is completely unaffected, and
opening any one of them in-app does not depend on `generateStaticParams` at all.** The
only thing that does not scale is *enumerating* them at build time, and you do not have
to.

Two separate things get conflated here, so keep them apart:

**1. Runtime data — no routing involvement whatsoever.** When the feed store swaps
`metadata.js` for a real `fetch`, that's ordinary data loading. Ids can be UUIDs, there
can be millions, they can be created a second ago. Nothing about the export cares,
because no route is being resolved. This is the layer described in
`frontend-architecture.md`, and it works identically in both build targets.

**2. Build-time enumeration — the only constrained part.** `generateStaticParams` in
`app/(protected)/p/[postId]/page.jsx` exists solely to satisfy the export, and it feeds
**only the standalone cold-load page**. It does not gate what the app can open:

- Opening a post in-app is `openSlide()` → `history.pushState`, which resolves no route
  and issues **zero network requests**. Verified: with the per-post pages removed from
  the bundle (so `/p/post-001.html` returns 404), tapping a post still opens the overlay
  with full content, and back still restores the feed's scroll offset.
- Natively it could not matter anyway — every extensionless path is served `index.html`,
  so a pre-rendered id and an unknown id are served byte-identically.

So the enumeration is close to vestigial for the native app, and paying for it at scale
is a real cost: each post is ~20 KB of `.html` + `.txt`, so 1,000 posts adds roughly
19 MB and 10,000 adds ~195 MB of files to the app bundle **that the native app never
serves**. It also couples every build to your API and still can't cover posts created
after the build.

### What to do when the corpus gets real

Stop enumerating the corpus. Return a single sentinel and let the two targets do what
each is good at:

```js
// Enough to satisfy the export; the native app opens posts via openSlide, not this page.
export const generateStaticParams = () => [{ postId: "_" }]
```

- **`[]` does not work** — Next reports `Page "/p/[postId]" is missing
  "generateStaticParams()" so it cannot be used with "output: export" config.` At least
  one entry is required. One entry is O(1) no matter how large the corpus gets.
- **Web deep links keep working** because the web deploys as the Node build, where
  `generateStaticParams` is only a pre-render *hint*: `dynamicParams` defaults to true,
  so any id renders on demand. Verified — `/p/does-not-exist-999` and
  `/p/some-uuid-4f8a2b` both return 200 from `npm run start`.
- **Do not call your API from `generateStaticParams`** to page through the whole table.
  If you want a few posts pre-rendered for SEO or link previews, enumerate a small
  bounded slice (recent or featured), never the corpus.

`PostView` already renders a "Post not found" state, so an id that no longer resolves
degrades gracefully rather than crashing.

One caveat to keep in mind: on native, a cold load of `/p/:id` is rewritten to the root
by the boot guard, so a native deep link into a specific post needs the replay described
in **The one constraint that shapes everything** — not a pre-rendered page.

---

## Native shell integration

`src/lib/native.js` holds the platform checks (`isNative`, `platform`) and a small
back-handler registry. `src/lib/hooks/useNative.hook.js` composes the shell effects and
is called once from `src/app/App.jsx`:

| Effect | Behaviour |
|---|---|
| Splash screen | `launchAutoHide: false` in config; hidden on the first frame after mount, so the app never flashes an unstyled shell |
| Status bar | Follows the resolved `next-themes` value — this is why `<App/>` sits *inside* `<Providers>` |
| Hardware back (Android) | Runs the topmost registered handler; else `history.back()`; else exits at the root |
| Keyboard | `resize: "native"` by default; dismissed when focus leaves an input; overridden per surface by `<KeyboardInset/>` (below) |

**`useBackHandler(active, onBack)`** is the hook any dismissible surface should use so
Android's back button closes it instead of leaving the app. `components/Comments.jsx`
is the reference. Handlers are a stack: the most recently registered wins.

Slide routes need no handler — they are real history entries, so back unwinds them
naturally, which is exactly why `closeSlide` uses `history.back()`.

---

## Keyboard — `components/KeyboardInset.jsx`

**Any surface with a field near the bottom of the screen — a composer, a form's submit
row — belongs in `<KeyboardInset/>`.** It is a flex column that keeps its own foot above
the on-screen keyboard, and an ordinary `div` everywhere but native iOS.

```jsx
<KeyboardInset>          {/* flush with the bottom of the screen */}
    …thread…
    <Composer />
</KeyboardInset>

<KeyboardInset rest="0px" offset="var(--bottombar)">   {/* floats above the nav rail */}
```

`offset` is how much of the keyboard something below the surface already covers, and
`rest` its padding with the keyboard down (the home-indicator inset by default). Mount it
only while the surface is on screen, or pass `active`.

**It requires the surface to hold a `useScrollLock`** — the two are a pair, and using it
without one lets a focus snap the page to the top. See the comment on `useKeyboardInset`
in `useNative.hook.js` for why iOS's own handling is bypassed; the short version is that
`resize: "native"` reflows the WebView ~800ms after focus, long after the keyboard has
finished animating, so the lift is driven off `keyboardWillShow` and the
`--keyboard-inset` variable instead.

---

## Safe areas

`viewportFit: "cover"` in the root layout's `viewport` export is what makes the insets
report real values. The two platforms then expose them differently, so `globals.css`
reads both, preferring Capacitor's injected variables and falling back to `env()`:

```css
--safe-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
```

Everything that touches a screen edge pads by the `--safe-*` tokens. Never use `env()`
directly at a call site — Android won't fill it in.

---

## Gotchas worth knowing

- **The stores are in-memory.** Killing the app loses everything except the persisted
  auth key (`synaxis-user` in `localStorage`). A native app makes this much more
  visible than a browser tab did.
- **`out/` is a build artifact**, as are `android/app/src/main/assets/public` and
  `ios/App/App/public`. Never edit them; they are overwritten by `cap sync`. `out`,
  `android`, and `ios` are in `globalIgnores` in `eslint.config.js`.
- **No `/api` in the native bundle.** A static export can't host route handlers. When a
  real API lands, deploy it as the Node build (or any service) and point the native app
  at its absolute URL.
- **Verify the export, not just `next dev`.** The dev server serves per-route HTML and
  runs middleware if present, so it hides both of the constraints above. Serve `out/`
  with an `index.html` fallback for extensionless paths to reproduce native routing.
- **Stop `next dev` before `npm run sync` / `ios` / `android`.** They all run
  `next build`, which shares `.next` with the dev server *and* writes `out/` inside the
  project the dev server is watching. Run them together and you get failures in both
  directions, none of which are real code errors:
  - the build dies with `Cannot find module for page: /inbox`, `Could not find files for
    /_error in .next/build-manifest.json`, or `TypeError: a[d] is not a function` while
    collecting page data or prerendering;
  - the dev server recompiles in a tight loop (watching `out/`) and starts serving 500s,
    with phantom `Cannot find module './992.js'` / `vendor-chunks/*.js` / `ENOENT` noise.

  Stop dev, run the build, then restart dev. If it stays broken, delete `.next` first.
- **Do not "fix" that with `distDir`.** Giving the native build its own build directory
  looks like the clean answer and is a trap: with `output: "export"` Next writes the
  exported site *into* `distDir`, so `out/` silently moves and `cap sync` fails with
  `Could not find the web assets directory: ./out`. It also doesn't help, because the
  dev-server thrashing comes from watching `out/`, not from sharing `.next`.
- **Route-shape changes need a dev restart.** The dev server caches the compiled route
  tree, so adding or removing a segment can leave it serving the old shape and throwing
  errors that no longer match your source. Restart before believing an error.
