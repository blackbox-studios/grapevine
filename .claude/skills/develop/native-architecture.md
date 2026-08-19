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
  `generateStaticParams` — which is why **post detail is not a route**. See
  **Dynamic routes at scale** below.
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
| `/p/[postId]` page enumerating every post id | no post route at all — `<SlidePage/>` resolves the pathname from the catch-all | A dynamic segment must enumerate its paths up front, which caps the app at a build-time corpus |

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
| Intercepting / parallel routes (`@slot`, `(.)path`) | Rejected by the export: `Intercepting routes are not supported with static export.` The check runs *after* the `generateStaticParams` check, so the first error you get is a misleading one about missing params — satisfy it and the real error appears. | Shallow history — see **Slide routes** |
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

**Nothing about a post is known at build time, and nothing needs to be.** The corpus can
be millions of UUIDs created a second ago. This is settled by not making post detail a
route at all — there is no `app/(protected)/p/[postId]/` folder, and `generateStaticParams`
appears nowhere near posts.

Two separate things get conflated here, so keep them apart:

**1. Runtime data — no routing involvement whatsoever.** The feed store fetching a page of
posts is ordinary data loading. Nothing about the export cares, because no route is being
resolved. This is the layer described in
`frontend-architecture.md`, and it works identically in both build targets.

**2. Routing — deliberately kept out of the export's way.** Both ways of reaching a post
resolve the **pathname**, never a route segment:

- **In-app** is `openSlide()` → `history.pushState`, which resolves no route and issues
  **zero network requests**. `<SlideRouter/>` draws the overlay off the `SLIDE_ROUTES`
  registry.
- **Cold** (refresh, shared link) is `<SlidePage/>`, mounted from the `[...not-found]`
  catch-all, which matches infinitely many paths off one sentinel param.

So the export emits no per-post files at all. That matters at scale: enumerating would
cost ~20 KB of `.html` + `.txt` per post — roughly 19 MB per 1,000 posts, ~195 MB per
10,000 — added to the app bundle **that the native app never serves**, since every
extensionless path is answered with `index.html` regardless. It would also couple every
build to your API and still miss anything created after the build.

### What this means in each target

- **Native:** unaffected. Every extensionless path is served `index.html`, so a known and
  an unknown id are byte-identical to the WebView.
- **Web (Node build):** `/p/<anything>` matches the catch-all at request time and returns
  200. Verified — `/p/post-001` and `/p/totally-made-up-uuid-9f8a` both render the post
  surface from `npm run start`.
- **Web (static export served directly):** `/p/<id>` has no file, so a plain host 404s
  unless you configure an `index.html` fallback for extensionless paths. Deploy the web
  target as the Node build (which is what `npm run build` / `npm run start` are for), or
  add that fallback at your host.

`PostView` renders a "Post not found" state, so an id that doesn't resolve degrades
gracefully rather than crashing.

Two caveats to keep in mind:

- On native, a cold load of `/p/:id` is rewritten to the root by the boot guard, so a
  native deep link into a specific post needs the replay described in **The one
  constraint that shapes everything**.
- **If you want a handful of posts pre-rendered for SEO or link previews**, add a
  *separate*, explicitly bounded route for it (recent or featured only) — never
  re-enumerate the corpus, and never call your API from `generateStaticParams` to page
  through a whole table.

---

## Testing sign-in on a device

**Magic links cannot work in the WebView.** Two mechanisms in this repo make that
structural, not incidental:

- the boot guard in `app/layout.jsx` rewrites any non-root URL to `/` **before hydration**,
  so a callback URL is discarded before any script sees it;
- `detectSessionInUrl: !isNative()` in `lib/supabase.js` is `false` there, so supabase-js
  never looks for one anyway.

So the **typed one-time code is the only way in on native**. On web you can fall back to a
link; here you cannot.

### The code, without sending any email

`npm run dev:login [admin|member|<email>]` mints the same token through the Supabase Admin
API and prints it. That code is valid for `verifyOtp` from anywhere — including a phone —
so device sign-in needs no working email at all:

1. On the device, enter the address and tap **Continue with email**.
2. On the Mac, `npm run dev:login -- admin`, and read the code it prints.
3. Type that code into the app.

Step 1 still calls `signInWithOtp`, which is what puts the form on the code screen. If it
is rate-limited (the built-in SMTP allows 2 messages an hour), the form **still advances**
— a code lasts an hour, so a rate-limited viewer is likely holding a valid one, and
stranding them on the email screen would throw it away. Every other failure keeps the form
put, because there is no code to enter.

### Wiring the device to the API

`NEXT_PUBLIC_*` is inlined at build time, so `.env` must be right *before* `npm run sync`.
Pointing `NEXT_PUBLIC_API_BASE_URL` at the Mac's LAN IP works for all three targets at once
(the simulator and emulator can both reach it, and it is the only thing a physical device
can reach).

```bash
pkill -f "next dev"     # a build and next dev fight over .next — see the gotchas below
npm run ios             # or: npm run android   (build:native + cap sync + open the IDE)
npm run dev             # restart: the device needs the API served
```

Android additionally needs three debug-scoped accommodations to reach an `http://` dev API,
all of which live under `android/app/src/debug/` and in `MainActivity.onCreate` — cleartext
permission, the debug manifest, and a mixed-content override (the WebView serves the app
from `https://localhost`, so Chromium blocks plain-http fetches without it). **Run the debug
variant**; a release build will not have them. iOS is unaffected, because its origin is
`capacitor://localhost` rather than https.

If the Mac's LAN IP changes, update it in **both** `.env` and
`android/app/src/debug/res/xml/network_security_config.xml`, then re-sync.

### Inspecting

| Platform | How |
|---|---|
| iOS | Safari → Develop → *(simulator or device)* → the WebView console |
| Android | `chrome://inspect` (`webContentsDebuggingEnabled: true` is already set) |
| Android network failures | `adb logcat \| grep -i "Mixed Content"` is the usual smoking gun |

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
| Keyboard | `resize: "none"`; height mirrored into `--keyboard-inset`; dismissed when focus leaves an input |

**`useBackHandler(active, onBack)`** is the hook any dismissible surface should use so
Android's back button closes it instead of leaving the app. `components/Comments.jsx`
is the reference. Handlers are a stack: the most recently registered wins.

Slide routes need no handler — they are real history entries, so back unwinds them
naturally, which is exactly why `closeSlide` uses `history.back()`.

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

## The keyboard

**The WebView is not resized on iOS.** `resize: "none"` in the plugin config, and
`useKeyboardInset` (in `useNative.hook.js`) mirrors the keyboard's height into
`--keyboard-inset` from `keyboardWillShow` / `keyboardWillHide` instead.

That is a deliberate trade, because the plugin's own modes can't animate. `resize: "native"`
re-frames the WebView from a *delayed* selector — the keyboard's animation duration plus
200ms — so the layout snaps a beat after the keyboard has already covered the field, and
every `dvh` in the app relayouts in that single frame. `keyboardWillShow` fires as the
animation begins and already carries the final height, so setting a custom property there
lets a CSS transition move with the keyboard rather than after it.

Three tokens come out of it (all defined and documented in `globals.css`):

| Token | Use |
|---|---|
| `--keyboard-inset` | How much of the bottom edge the keyboard covers; `0px` when down |
| `--bottom-inset` | What a bottom-pinned surface must clear: `max(--safe-bottom, --keyboard-inset)` — never both, a raised keyboard covers the home indicator |
| `--viewport-height` | `100dvh` minus the keyboard; size against this where something has to fit in the room left over |

**Any surface with a text input near the bottom of the screen has to opt in** — nothing
lifts it for you now. `Comments.jsx` (the drawer's foot) and `PostView.jsx` (the mobile
sheet's bottom edge, and the media cap that yields room to it) are the two worked examples.

Android is left on its own: the `resize` option is iOS-only, Android resizes its WebView as
the keyboard opens, and `--keyboard-inset` therefore stays `0px` there — which is why the
tokens are written to degrade to the plain safe-area/`dvh` behaviour rather than to require
the inset.

> **A drawer with an input needs `repositionInputs={false}`.** Vaul's default keeps
> react-aria's mobile-Safari scroll lock installed, which `preventDefault`s every `touchend`
> over an input and focuses the field itself. That hand-rolled focus does not take in the
> Capacitor WebView: the field never focuses, so there is no caret, no keyboard, and no way
> to type even with a hardware keyboard attached. It looks like a dead control, and it only
> reproduces in the native build.

---

## Gotchas worth knowing

- **The stores are in-memory.** Killing the app loses everything except the persisted
  auth key (`synaxis-user` in `localStorage`). A native app makes this much more
  visible than a browser tab did.
- **`out/` is a build artifact**, as are `android/app/src/main/assets/public` and
  `ios/App/App/public`. Never edit them; they are overwritten by `cap sync`. `out`,
  `android`, and `ios` are in `globalIgnores` in `eslint.config.js`.
- **No `/api` in the native bundle.** A static export can't host route handlers, so the
  native app must be pointed at a deployed Node build by absolute URL
  (`NEXT_PUBLIC_API_BASE_URL`). The Supabase URL and anon key are inlined at build time
  too — re-run `npm run sync` after changing any of them.
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
