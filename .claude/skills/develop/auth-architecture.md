# Auth Architecture

> **Purpose.** How authentication works in Synaxis today (a deliberately lightweight
> mock) and how to swap it for a real provider without rewriting the app. Read this
> before touching `src/components/AuthGate.jsx`, `src/lib/store/auth/`, or the login
> page.
>
> Companion docs: `SKILL.md` (project rules), `frontend-architecture.md` (the layered
> store/hook rules that auth follows), and `native-architecture.md` (why the gate has
> to be client-side at all).

---

## TL;DR — current state

- **Auth is a mock.** Any credentials sign the user in — the whole gate is
  `loggedIn = true`. There is no password check, no token, no external provider.
- **One piece of state:** `loggedIn` / `user` in the Zustand auth store
  (`src/lib/store/auth/store.js`), persisted to `localStorage` (key `synaxis-user`) so
  a reload keeps you signed in. There is no companion cookie.
- **The route guard is a client component.** `<ProtectedGate>` and `<PublicGate>` in
  `src/components/AuthGate.jsx` wrap the two route groups' layouts and redirect on a
  mismatch.

> **Why not middleware?** The app ships as a static export for the native build
> (`output: "export"`), and Next drops `middleware.js` silently in that mode — the gate
> would evaporate exactly where it matters. A client gate is the one form that works in
> both targets. See `native-architecture.md`.

---

## The flow

```
login page (any credentials)
      │  useLogin() → store.login()
      ▼
auth store:  loggedIn = true, user = CURRENT_USER   (persisted to localStorage)
             router.replace("/")
      ▼
<ProtectedGate> sees loggedIn → renders the shell
<PublicGate> on /login would see loggedIn → redirects to /
```

Logout reverses it: reset the stores + `router.replace("/login")`.

Both gates hold rendering until mounted (`useMounted`) before deciding, so the
persisted value has been rehydrated and the two targets agree on the first paint.
The tradeoff versus middleware is that the redirect happens after mount rather than
before the response, which is why the gates render `null` rather than their children
while undecided — no protected content is ever painted for a signed-out visitor.

Files:

- `src/lib/store/auth/store.js` — `login` / `logout` / `init`; the `CURRENT_USER` /
  `USERS` seed comes from `src/lib/metadata.js`.
- `src/lib/store/auth/hook.js` — `useLogin`, `useLogout`, `useUser`, `useAdmin`,
  `useAuthed` (the only things components touch).
- `src/components/AuthGate.jsx` — the two gates.
- `src/app/(public)/login/page.jsx` — the login form (demo defaults, no validation).

---

## Replacing the mock with a real provider

The seam is deliberately small. When you add real auth (Supabase, NextAuth/Auth.js,
Clerk, Auth0, a custom `/api/auth/*` route handler, etc.):

> **First read the "Adding a library" section of `native-architecture.md`.** Every one of
> those vendors' Next.js guides is written for a Node server and will tell you to add a
> `middleware.js` that refreshes the session per request. That file is dropped silently by
> the static export — you would ship with no gate and no error. Use the vendor's
> **browser** client, which persists and refreshes the session client-side, and keep the
> gates below as the only route protection.

1. **Session.** Have the login endpoint set an **HTTP-only session cookie** (the login
   response / token exchange / OAuth callback). The native build can't rely on
   middleware to read it, so treat the cookie as transport for API calls and keep
   `loggedIn` as the client's view of "is there a session".
2. **Gates.** `AuthGate` keeps working unchanged — point it at the real session check
   (e.g. a `/api/me` probe on boot feeding `loggedIn`). The redirect logic stays exactly
   the same; only the "is this session valid?" question changes. If you also deploy the
   Node target for the web, you may *add* middleware there as defence in depth, but the
   gates must remain, since the static build has no server.
3. **Store.** `store.login` stops fabricating a user and instead reads the real
   session/profile (e.g. from the provider's SDK or a `/api/me` call); `user` /
   `loggedIn` keep the same shape so every consumer (`useUser`, `<Profile/>`, the
   `App.jsx` `initAuthorizedStores` effect) works unchanged.
4. **User shape.** Components read `user.full_name`, `user.email`, `user.role`. Map
   the provider's profile onto that shape (or update the consumers) so the UI keeps
   rendering.

Because the store is the only coupling, you can land real auth without touching the
pages, the layout, or the gates' redirect rules.
