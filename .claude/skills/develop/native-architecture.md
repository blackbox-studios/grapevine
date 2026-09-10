# Native Architecture (Capacitor)

> **Purpose.** How Grapevine ships as an iOS/Android app through Capacitor, and the
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
  **zero network requests**. `<SlideRouter/>` draws the overlay off the `RUNTIME_ROUTES`
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
is rate-limited (Authentication → Rate Limits, 30 messages an hour), the form **still advances**
— a code lasts an hour, so a rate-limited viewer is likely holding a valid one, and
stranding them on the email screen would throw it away. Every other failure keeps the form
put, because there is no code to enter.

### Wiring the device to the API

`NEXT_PUBLIC_*` is inlined at build time, so `.env` must be right *before* `npm run sync`.
Pointing `NEXT_PUBLIC_API_BASE_URL` at the Mac's LAN IP works for all three targets at once
(the simulator and emulator can both reach it, and it is the only thing a physical device
can reach).

```bash
npm run ios             # or: npm run android   (build:native + cap sync + open the IDE)
```

`next dev` can stay up throughout — it needs to, in fact, since the device is talking to it.
Building both platforms is one sync and two opens: `npm run sync`, then `npm run open:ios`
and `npm run open:android`, which skip the build.

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
| Android | `chrome://inspect` — works on the **debug** variant with no config at all |
| Android network failures | `adb logcat \| grep -i "Mixed Content"` is the usual smoking gun |

---

## Native shell integration

`src/lib/native.js` holds the platform checks (`isNative`, `platform`) and a small
back-handler registry. `src/lib/hooks/useNative.hook.js` composes the shell effects and
is called once from `src/app/App.jsx`:

| Effect | Behaviour |
|---|---|
| Splash screen | `launchAutoHide: false` in config; held until the route gates have an answer to draw (capped, so a hung session check still opens the app), so the app never flashes an unstyled shell or a blank one |
| Status bar | Follows the resolved `next-themes` value — this is why `<App/>` sits *inside* `<Providers>` |
| Hardware back (Android) | Runs the topmost registered handler; else `history.back()`; else exits at the root |
| Keyboard | `resize: "none"`; height mirrored into `--keyboard-inset`; dismissed when focus leaves an input |

**`useBackHandler(active, onBack)`** is the hook any dismissible surface should use so
Android's back button closes it instead of leaving the app. `components/Comments.jsx`
is the reference. Handlers are a stack: the most recently registered wins.

Slide routes need no handler — they are real history entries, so back unwinds them
naturally, which is exactly why `closeSlide` uses `history.back()`.

---

## Links out of the app

A URL somebody types into a post or a comment is rendered as a real `<a href>` by
`<Linkify/>`, which tokenizes the body with `linkTokens` in `lib/utils.js` (a tokenizer
rather than a string of HTML: bodies are author input, so the only safe rendering is React
children).

**The tap needs no plugin.** Capacitor's own navigation delegate cancels any top-level
navigation off the app's origin and hands the URL to the OS — `UIApplication.open` on iOS,
an `ACTION_VIEW` intent on Android — so the link opens in the phone's browser and the app
stays where it was. There is no `@capacitor/browser` here and none is wanted.

**The hold is the app's own menu, not the WebView's.** `globals.css` suppresses
`-webkit-touch-callout` across the packaged app, and Android's WebView has no link menu to
begin with, so a long press draws a popover with **Open in browser** and **Copy link** —
the same `<MenuItems/>` rows `<HoldMenu/>` uses, so a held link and a held comment answer
the same way. `ios.allowsLinkPreview: false` in `capacitor.config.json` is what stops
WebKit's own context menu racing it; it is the only reason that key is set.

That menu is also the whole of copy/paste on a body: selection stays off everywhere, and
copying a link is a menu item rather than a text selection. In a browser the hold is off
entirely, because Safari and Chrome already offer their own on the same gesture.

### The one exception: an embedded video

`server.allowNavigation` names exactly one host, `www.youtube.com`, and it is there because
an embedded player is a **subframe** navigating off-origin.

The two platforms disagree about that. iOS computes `toplevelNavigation` from
`navigationAction.targetFrame?.isMainFrame` before handing anything to the OS, so a subframe
loading YouTube falls through to `.allow` and needs no permission. Android's
`BridgeWebViewClient` is called for subframe navigations too and passes the URL straight to
`Bridge.launchIntent`, which never asks `request.isForMainFrame()` — so without this entry the
player's own frame is thrown out to an `ACTION_VIEW` intent and pressing play leaves the app
for the YouTube app.

**Know what the entry costs before adding a second one.** The list is matched on host alone,
and iOS consults it *before* the top-level test — so a host on this list is also a host the
app will navigate its **main frame** to. `www.youtube.com` is exactly what an admin types into
a post body, so a YouTube link in a post no longer goes out to the phone's browser: it loads
inside the WebView, with the app's own chrome gone. Android's back gesture walks the WebView's
history back out of it; iOS has no back, so it is a force-quit. That is the standing trade for
inline playback on Android, and it is the reason this list is one host and not a convenience.

The narrower fix, if that trade ever stops being worth it, is the check Android omits rather
than a longer list: a `BridgeWebViewClient` subclass installed through
`bridge.setWebViewClient()` (not `webView.setWebViewClient()`, which leaves the Bridge's own
reference stale) returning `false` for `!request.isForMainFrame()`. That is Android's own
documented guidance, it needs no allow-list at all, and it costs a native file that has to be
re-verified on a device.

### iOS cannot be the embedder, so a page on our own domain is

An iOS build serves itself from `capacitor://localhost`. YouTube validates the origin
embedding its player and refuses anything that is not http(s), which is **error 153** drawn
where the video should be. Android does not have this: its default scheme is already `https`
(`CAPACITOR_HTTPS_SCHEME`).

**`server.iosScheme` cannot fix it, and fails silently if you try.**
`CAPInstanceDescriptor.normalize()` accepts a scheme only when
`WKWebView.handlesURLScheme(scheme) == false` — WebKit reserves http and https, so either
value fails the check and the scheme is quietly reset to `capacitor`. Nothing warns and the
config parses. Any scheme that *is* accepted is by definition not http(s), so no value in that
field solves this.

So the app stops being the embedder. `public/embed.html` is a page served by our own
deployment that holds the player, and on iOS `<Video/>` points its iframe at that instead of
at YouTube, which then sees an ordinary web origin embedding it.

**The scheme is the whole of what YouTube wanted, not a public domain.** The page satisfies it
from `http://192.168.1.x:3000` — a LAN dev server, over cleartext, on an address no registrar
has heard of — exactly as it does from the deployed site. So this is not a production-only
path: it works on a device against `next dev` the moment `NEXT_PUBLIC_API_BASE_URL` points at
your machine, which is what makes it testable at all.

Three things about it are load-bearing:

- **It is a file in `public/`, not a route.** It inherits no layout, no providers and no auth
  gate, it is copied verbatim into both build targets, and it carries no bundle. An
  intermediate frame should cost a few hundred bytes.
- **Its URL comes from `API_BASE`** (`youtubeEmbedPageUrl`), because that is already the one
  thing a native build is told about its deployment and the same instance serves both. A
  subpath deploy resolves with nothing new to configure.
- **`allow` is repeated inside it.** Permissions delegate one frame at a time, so autoplay
  granted to that page by the app reaches the player only because the page passes it on.

This makes video on iOS depend on whatever `NEXT_PUBLIC_API_BASE_URL` named **at build time**
being reachable, which is the price of an origin the app cannot otherwise have. That value is
inlined, so the ordering matters for a release: the web has to be deployed with `embed.html`
before an iOS build pointing at it is submitted, or video is a dead frame that no setting can
correct short of another upload. Note that `apiTargetProblems` guards only the Android release
script — `npm run ios` opens Xcode with whatever was in the environment, so nothing stops a
LAN address being archived.

If a CSP is ever added to the deployment, its `frame-ancestors` has to admit the app or this
page stops loading.

`capacitor.config.json` holds no comments, which is why this is written here. Changing it
needs `npm run sync` before either platform sees it.

---

## Push notifications (Firebase)

**The row is the notification; a push is one delivery of it.** Nothing in the app
depends on a delivery having succeeded — a device that was asleep, denied permission,
or never granted it finds the same rows in the panel behind the bell. That framing is
what makes every piece of this optional, and it is written up at the top of
`src/lib/server/notifications.service.js`.

| Piece | Where |
|---|---|
| Device side (permission, token, listeners) | `src/lib/push.js` |
| State + registration | `src/lib/store/push/store.js`, `.../hook.js` |
| Token table | `DeviceToken` in `prisma/schema.prisma`, `src/lib/server/devices.service.js` |
| FCM transport | `src/lib/server/push.js` |
| The sends | the delivery section of `src/lib/server/notifications.service.js` |

### Why `@capacitor-firebase/messaging` and not `@capacitor/push-notifications`

The official plugin **does not use Firebase on iOS**: its `registration` event returns
an APNs device token there, and an FCM token only on Android. Two token formats means
two senders, two credentials to rotate, two error taxonomies, and a `provider` column
every send site branches on. This plugin returns an FCM token on both platforms, so
the server has one transport and the table has one kind of row.

The `firebase` npm package is installed **only to satisfy the bundler** — the plugin's
web implementation statically imports `firebase/messaging`, and webpack resolves that
whether or not it runs. It sits behind `registerPlugin`'s lazy `import('./web')`, so
the chunk is emitted into `out/` and never fetched on native.

### One-time setup, per Firebase project

1. **Firebase console** → create a project (or reuse one), then add an **Android** app
   with applicationId `com.throughgrapevine.app` and an **iOS** app with the same
   bundle id.
2. **`android/app/google-services.json`** — download from the Android app's settings
   and drop it in. Committed, not a secret.
3. **`ios/App/App/GoogleService-Info.plist`** — download from the iOS app's settings,
   then **add it to the Xcode target**. Dragging it into the folder in Finder is not
   enough; it has to appear in *Build Phases → Copy Bundle Resources* or the SDK
   cannot find it at launch and `FirebaseApp.configure()` fails.

   This project is `objectVersion = 60` and does **not** use Xcode 16's
   filesystem-synchronized groups, so there is no automatic membership. Check it:

   ```bash
   grep -c "GoogleService-Info.plist" ios/App/App.xcodeproj/project.pbxproj  # > 0
   ```
4. **APNs auth key** — Apple Developer portal → Keys → a new key with *Apple Push
   Notifications service* enabled. Download the `.p8` (it can only be downloaded
   once), then upload it under Firebase → Project settings → **Cloud Messaging** with
   its Key ID and your Team ID. Without this, iOS registers and never receives
   anything.
5. **Xcode** → the App target → Signing & Capabilities → add **Push Notifications**.
6. **The service account** → Firebase → Project settings → Service accounts →
   *Generate new private key*. Its three fields become `FCM_PROJECT_ID`,
   `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` on the **deployed API**, not in the app.
   See `.env.example` for the newline escaping, which is the usual thing to get wrong.
7. `npm run sync` — the native projects hold a copy of `out/` and of the plugin
   registry, so nothing above takes effect until this runs.

Android 13+ needs the `POST_NOTIFICATIONS` runtime permission; the plugin declares it
and `requestPushPermission()` asks for it. Nothing to add to the manifest.

### A refusal is not the end of the offer

The prompt is spendable, and the two platforms spend it differently. iOS shows it **once
per install**; Android reports `prompt-with-rationale` after a first refusal and will
re-ask, so only its second refusal is final. `pushPermission()` folds that into three
values worth acting on — `null` (a prompt will actually appear, Android's first "no"
included), `"granted"`, and `"denied"` meaning **spent on both platforms**.

So the "Turn on notifications" button in `/settings/general` is drawn in all three
states, and `turnOn` in the push hook picks what a tap means: prompt while one is
possible, otherwise `openPushSettings()` — the app's own notification pane, via
`capacitor-native-settings`. A refusal must not remove the control; the way back exists,
and it is a screen the app can open.

- **The iOS options are not interchangeable.** `IOSSettings.AppNotification` resolves to
  Apple's public `openNotificationSettingsURLString` (16+) / `openSettingsURLString`.
  Most of that enum's other members are the undocumented `App-prefs:` schemes, and
  shipping one is an App Store rejection.
- **The return trip has to be watched for**, because the grant happens while the app is
  backgrounded. `refresh()` runs on every foreground (`onAppState` in
  `usePushListeners`) and registers the token if the answer has become yes; without it
  the deep link is an instruction the app then ignores.
- The plugin needs `npm run sync` plus a native rebuild — a pod install on iOS, a Gradle
  sync on Android — before the button can do anything on device.

> **Do not put `webContentsDebuggingEnabled: true` back in `capacitor.config.json`.** It
> looks like what enables `chrome://inspect`, and it is not needed for that: Capacitor
> defaults the key to the build's own debug flag (`CapConfig.java` reads
> `getBoolean(configJSON, "android.webContentsDebuggingEnabled", isDebug)`), so debug builds
> are already inspectable. Setting it explicitly overrides that default in **both**
> directions and ships a **release** app whose WebView anyone can attach a debugger to.

### Two things that will waste an afternoon

- **APNs does not work on the iOS Simulator.** A physical device is the only way to
  test the iOS half. Android's emulator is fine.
- **`openPushSettings()` lands on the *root* of Settings on the iOS Simulator**, not on
  Grapevine's notification pane, and nothing is wrong. The Simulator's Settings app has
  no per-app notification pane to navigate to, so it abandons the deep link and stops at
  the top; it says so in the device console (`… is for a selection not possible currently
  'notifications', stashing as pending and returning`). It resolves on hardware, there is
  no workaround, and switching the option to `IOSSettings.App` is not one — that trades
  the right destination on every real device for a better one on the Simulator.
- **`presentationOptions: []`** in `capacitor.config.json` is deliberate — JSON has
  nowhere to say so. It suppresses the iOS banner while the app is *foregrounded*,
  because the reader is already looking at the app; what a foreground push means here
  is only that the bell is stale, which is why `onPushReceived` refreshes the tally
  and draws nothing. Set it back to `["alert","badge","sound"]` only if you decide
  banners-over-the-feed are wanted.

### Where a tap goes

`notificationActionPerformed` → the payload's `data.postId` → `openSlide("/p/<id>")`.
It is the same shallow-history navigation the feed uses, for the same reason: a post
has no route, because its id was unknown at build time.

**A cold launch replays the tap that started the process**, and it arrives before the
session has resolved. So the listeners are mounted unconditionally (a listener
attached after the fact never hears it) and the destination is parked in the store's
`pending` until `ready` — a resolved, signed-in session — flushes it. Gating the
listener on `loggedIn` instead is what makes a tapped notification open the feed and
throw the destination away.

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

**A collapse is written the frame it arrives, like a raise**, so both directions ride the
keyboard's own animation. The single exception is opt-in and lives behind `useKeyboardSettle`
— a surface that swaps a focused field out for another one asks for the collapse to be held
until it is certain (`KEYBOARD_SETTLE_MS`, and the reasoning, in `useNative.hook.js`). Do not
make that global: the wait is by construction longer than the keyboard's dismiss animation,
so every ordinary surface would sit still until the keyboard had entirely gone.

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
  auth key (`grapevine-user` in `localStorage`). A native app makes this much more
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
- **`next dev` builds into `.next-dev`, and that is what keeps a build off its back.**
  Every build target writes `.next` — the export uses it as scratch on the way to `out/` —
  so a dev server sharing it gets its manifests overwritten mid-flight and both sides fail
  in ways that look like code errors: the build dies with `Cannot find module for page:
  /inbox` or `Could not find files for /_error in .next/build-manifest.json`, and the dev
  server serves 500s with phantom `Cannot find module './992.js'` / `vendor-chunks/*.js`
  noise. The dev server is the side that moves, because `distDir` cannot be used to move
  the other one: under `output: "export"` Next reads `distDir` as the destination of the
  *exported site* and resets the build directory to `.next`, so aiming the native build
  elsewhere silently relocates `out/` and `cap sync` fails with `Could not find the web
  assets directory: ./out`. See the phase-conditional export at the foot of
  `next.config.mjs`. If a dev server does get into a bad state, delete `.next-dev`.
- **Route-shape changes need a dev restart.** The dev server caches the compiled route
  tree, so adding or removing a segment can leave it serving the old shape and throwing
  errors that no longer match your source. Restart before believing an error.
