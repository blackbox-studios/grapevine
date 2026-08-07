# Auth Architecture

> **Purpose.** How authentication works in Scrolls today (a deliberately lightweight
> mock) and how to swap it for a real provider without rewriting the app. Read this
> before touching `src/middleware.js`, `src/lib/store/auth/`, or the login page.
>
> Companion docs: `SKILL.md` (project rules) and `frontend-architecture.md` (the
> layered store/hook rules that auth follows).

---

## TL;DR — current state

- **Auth is a mock.** Any credentials sign the user in — the whole gate is
  `loggedIn = true`. There is no password check, no token, no external provider.
- Two pieces of state are written together on login and cleared together on logout:
  1. **Client UI state** — `loggedIn` / `user` in the Zustand auth store
     (`src/lib/store/auth/store.js`), persisted to `localStorage` (key `scrolls-user`)
     so a reload keeps you signed in.
  2. **A server-readable cookie** — `scrolls-auth`, set via `document.cookie`, so the
     Next middleware (which can't read `localStorage`) can gate routes on the server.
- **`src/middleware.js`** is the route guard. It runs on every matched request
  (including client navigations) before the page renders: no `scrolls-auth` cookie →
  redirect to `/login`; has the cookie and on `/login` → redirect to `/`. There are
  **no client guard components** (`ProtectedRoute`/`PublicRoute`).

---

## The flow

```
login page (any credentials)
      │  useLogin() → store.login()
      ▼
auth store:  loggedIn = true, user = CURRENT_USER   (persisted to localStorage)
             document.cookie "scrolls-auth=1"        (server-readable gate)
             router.replace("/")
      ▼
middleware.js reads the scrolls-auth cookie on every request → allows /,
      redirects unauthenticated requests to /login
```

Logout reverses both: `clearAuthCookie()` + reset the stores + `router.replace("/login")`.

Files:

- `src/lib/store/auth/store.js` — `login` / `logout` / `init`; `setAuthCookie` /
  `clearAuthCookie`; the `CURRENT_USER` / `USERS` seed comes from `src/lib/metadata.js`.
- `src/lib/store/auth/hook.js` — `useLogin`, `useLogout`, `useUser`, `useAdmin`
  (the only things components touch).
- `src/middleware.js` — the server-side gate + its `matcher` config.
- `src/app/(public)/login/page.jsx` — the login form (demo defaults, no validation).

---

## Replacing the mock with a real provider

The seam is deliberately small. When you add real auth (NextAuth/Auth.js, Clerk,
Auth0, a custom `/api/auth/*` route handler, etc.):

1. **Session cookie.** Replace the client-written `scrolls-auth` cookie with an
   **HTTP-only session cookie set by the server** (the login response / token
   exchange / OAuth callback). Delete `setAuthCookie` / `clearAuthCookie`.
2. **Middleware.** Point `src/middleware.js` at the real session cookie (or verify a
   JWT). The redirect logic stays exactly the same — only the "is this request
   authenticated?" check changes.
3. **Store.** `store.login` stops fabricating a user and instead reads the real
   session/profile (e.g. from the provider's SDK or a `/api/me` call); `user` /
   `loggedIn` keep the same shape so every consumer (`useUser`, `<Profile/>`, the
   `App.jsx` `initAuthorizedStores` effect) works unchanged.
4. **User shape.** Components read `user.full_name`, `user.email`, `user.role`. Map
   the provider's profile onto that shape (or update the consumers) so the UI keeps
   rendering.

Because the cookie is the only server-side coupling and the store is the only
client-side coupling, you can land real auth without touching the pages, the layout,
or the middleware's redirect rules.
