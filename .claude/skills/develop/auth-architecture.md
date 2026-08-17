# Auth Architecture

> **Purpose.** How authentication and authorization work in Synaxis. Read this before
> touching `src/components/AuthGate.jsx`, `src/components/Auth.jsx`, `src/lib/store/auth/`,
> `src/lib/supabase.js`, `src/lib/server/auth.js`, or the login page.
>
> Companion docs: `SKILL.md` (project rules), `frontend-architecture.md` (the layered
> store/hook rules auth follows), `backend-architecture.md` (the API contract these checks
> live in), and `native-architecture.md` (why every gate has to be client-side).

---

## TL;DR

- **Supabase Auth**, emailed one-time code. No passwords, no OAuth, no magic-link redirect.
  The code is **8 digits on this project**, not the six most documentation assumes — it is a
  dashboard setting (Authentication → Sign In / Providers → Email → Email OTP Length),
  mirrored as `OTP_LENGTH` in `lib/constants.js`.
- **Invite-only, enforced by the provider.** `signInWithOtp({ shouldCreateUser: false })` —
  an email with no `auth.users` row can never be sent a code.
- **Two identities, kept apart.** Supabase owns the *session*; `GET /api/me` owns the
  *viewer* (profile, vocation, role, groups). `loggedIn` means both are in place.
- **Two authorization axes.** `Membership.role` (ADMIN | MEMBER) is per-group permission.
  `Profile.vocation` (PRIEST | FAITHFUL) is presentational and grants nothing.
- **Route guards are client components** (`AuthGate.jsx`), because a static export has no
  server. **Real enforcement is server-side**, in `src/lib/server/auth.js`.

---

## The flow

```
/login  ── email ──────────► supabase.auth.signInWithOtp({ shouldCreateUser: false })
                             └─ unknown address → rejected here, no code sent
        ── code ───────────► supabase.auth.verifyOtp()      → a Supabase session exists
                           ► GET /api/me                    → the app's view of the person
                             └─ 401/no Profile → sign back out; a session alone is not entry
                           ► loggedIn = true, router.replace("/")

<ProtectedGate> sees loggedIn → renders the shell
<PublicGate> on /login sees loggedIn → redirects to /
```

Sign-out reverses it: `supabase.auth.signOut()`, reset every store, `replace("/login")`.

### Why a code and not a magic link

A link has to redirect somewhere, and a Capacitor WebView has no origin for a provider to
redirect back to. Worse, the boot guard in `app/layout.jsx` rewrites any non-root URL to
`/` **before hydration** (see `native-architecture.md`), so a callback URL is discarded
before anything could read it. Making a link work natively needs a custom URL scheme, the
Capacitor `Browser`/`App` plugins, and a replay of the captured path after mount.

A code needs none of that — the user types it into the screen they started on — so web and
native run byte-identical paths. `detectSessionInUrl` is still on off-native, so the link
in the same email works in a browser as a bonus.

> **Sign-in does not work until the Magic Link template contains `{{ .Token }}`.** Email
> OTP and magic link are one implementation in Supabase, and the template alone decides
> which is sent. The stock template has only `{{ .ConfirmationURL }}`, so no code is ever
> delivered and the second step of the login screen cannot be completed. This project is on
> Pro, so that is a dashboard edit — Authentication → Email Templates → Magic Link.
>
> (Worth knowing if this is ever forked onto a free project: Supabase locked template
> editing for new free-tier projects on its built-in SMTP as of 3 June 2026, which makes
> custom SMTP a hard prerequisite there rather than a production nicety.)

> **The built-in SMTP allows 2 messages per hour, project-wide.** Two sign-in attempts an
> hour is not enough to develop against, and demoing both sides of the permission model
> means signing in as two people in quick succession. Exceeding it returns
> `429 over_email_send_rate_limit`. The cap can only be raised by configuring custom SMTP.
>
> `npm run dev:login [admin|member|<email>]` sidesteps it entirely: it mints the same
> verification token through the Admin API and prints it instead of mailing it, so no
> message is sent and no quota is consumed. Local script only — it needs the secret key, and
> a *route* that issues a session for an arbitrary address would be a backdoor by
> construction.
>
> A rate-limited send still advances the form to the code screen, because a code lasts an
> hour and the viewer is likely holding a valid one. Every other failure keeps the form on
> the email step, since there would be nothing to type.
>
> Raising the cap means custom SMTP, and every provider worth using (Resend, Postmark, SES)
> requires a **verified sending domain** — there is no shared test sender. So this is
> blocked on owning a domain, and `dev:login` is the answer until then.

> **The built-in SMTP only delivers to your own organization's team.** Supabase's default
> sender refuses any address that is not a member of the project's organization —
> everything else fails with *"Email address not authorized"* — and it carries a low cap
> and no delivery SLA. That is a property of the default sender, **not** of the plan, so
> Pro does not lift it. Either add test addresses under the organization's Team tab, or
> configure custom SMTP (Resend, Postmark, SES), which is required before real
> parishioners use this regardless. `SEED_ADMIN_EMAIL` / `SEED_MEMBER_EMAIL` exist so the
> seeded accounts can point at addresses you actually receive mail at.

### Why invite-only is one option object

`shouldCreateUser: false` makes Supabase refuse to create an account, so provisioning is
the only way in. The gate is in the provider rather than in app code that could be
bypassed. Two consequences worth knowing:

- The login screen has **no sign-up affordance by design**. Don't add one.
- The error message deliberately does not confirm whether a given address has an account —
  otherwise the login form becomes a membership oracle for the parish.

---

## The two identities

| | Owned by | Persisted by | Answers |
|---|---|---|---|
| **Session** | supabase-js | `localStorage` (`synaxis-auth`), auto-refreshed | "who is this, cryptographically" |
| **Viewer** | `GET /api/me` | the auth store (`synaxis-user`), as a cache | "what does this app know about them" |

Keeping them apart is not ceremony. A verified token with **no Profile row** is a real
state — an interrupted invite leaves one — and it is *not* a valid session for this app.
`verifyCode` tears the Supabase session back down if `/api/me` fails, so a viewer is never
left half-signed-in looking at a shell that 401s on everything.

The persisted `loggedIn`/`user` is a **cached view, not the truth**. `init()` reconciles it
against Supabase on every boot; without it a reload would bounce a valid session to
`/login` while the session check was still in flight.

---

## Enforcement: client hides, server decides

This is the part to get right.

### Server — the only thing that actually protects anything

`src/lib/server/auth.js`. Every handler that touches user data starts with
`requireViewer(request)`; every handler that touches a group's data follows it with
`requireMembership(...)`. If a service is reachable without passing through those, that is
the bug.

```js
export const GET = route(async (request) => {
    const viewer = await requireViewer(request)          // 401 if no valid token/profile
    return sendResource(await getViewer(viewer))
})
```

| Function | Throws | When |
|---|---|---|
| `requireViewer(request)` | `401 UNAUTHENTICATED` | no bearer token, token fails Supabase verification, or no Profile for its `sub` |
| `requireMembership(id, orgId)` | `404 NOT_FOUND` | no membership, or REJECTED |
| | `403 PERMISSION_DENIED` | PENDING, REVOKED, or wrong role |
| `readableOrgIds(id)` | — | the APPROVED set the feed is scoped to |

**404 rather than 403 for a non-member** is deliberate: confirming a group or post exists
would leak the contents of a parish the viewer was never admitted to. Wrong-role gets 403,
because the viewer already knows the group exists.

The token is verified with `supabase.auth.getUser(jwt)` — a network round trip per request.
Never trust a decoded JWT body without it; the payload is base64, not a proof. If that
latency matters, verify the signature locally against the project's JWKS with `jose` and
keep the Profile lookup exactly as it is.

### Client — presentation only

`src/components/Auth.jsx`:

- **`<Privileged role={…} orgId={…}>`** — inline UI. Renders children if the viewer meets
  or exceeds the role, else `fallback` (default `null`), or dimmed and inert with
  `disabled`.
- **`<PrivilegedRoute role={…}>`** — whole routes. Redirects instead of hiding.

> **A gate that exists only here does not exist.** The API is reachable with `curl`. These
> keep people from reaching for controls that would fail; they are not a control.

Convention: hide affordances for a tier the viewer can never reach; use `disabled` only to
signal that an action exists at a higher tier to someone plausibly close to it.

### Why not middleware, and why not RLS

**Middleware** — `output: "export"` drops `src/middleware.js` silently. No build error, no
runtime error; the app just ships with no gate. Every vendor quickstart will tell you to
add one. Don't. See `native-architecture.md`.

**RLS** — is *also* required, for a different door, and `prisma/policies.sql` is where it
lives. The two are not alternatives:

- Row-level policies never apply to `/api`, because Prisma connects as the table owner and
  an owner is exempt from RLS. So RLS could not enforce the rules above even in principle.
- But Supabase auto-generates a **Data API** over the `public` schema, authenticated with
  the publishable key that is compiled into our own client bundle. That endpoint bypasses
  `requireViewer` entirely. `GET /rest/v1/post?select=*` with a key lifted from devtools
  would return every parish's posts.

`prisma/policies.sql` enables RLS with no policies (deny-all) and revokes the `anon` /
`authenticated` grants, which closes that door without affecting the app. **Re-run
`npm run db:secure` after every migration** — a migration that adds a table adds it
unprotected, which is why the file also installs an event trigger as a backstop.

---

## The two axes

Conflating these is the mistake the schema is shaped to prevent.

| | Values | Scope | Grants |
|---|---|---|---|
| `Membership.role` | `ADMIN`, `MEMBER` | **per group** | ADMIN may publish; MEMBER may read, like, comment |
| `Profile.vocation` | `PRIEST`, `FAITHFUL` | global | nothing — it is a label |

A priest is *usually* their parish's admin but need not be, and an admin need not be a
priest. Because roles are per-group, `useRole(orgId)` / `usePrivileged(role, orgId)` always
resolve against one group; a global "am I admin" would paper over that the moment a second
group exists.

`MembershipStatus` is the third piece: only `APPROVED` puts a group's posts in a viewer's
feed. Revoking is a status change, not a delete, so the history survives.

---

## Files

| Concern | File |
|---|---|
| Browser client, session, `accessToken()` | `src/lib/supabase.js` |
| RLS + Data API lockdown | `prisma/policies.sql` (`npm run db:secure`) |
| Server clients (anon + service role) | `src/lib/server/supabase.js` |
| `requireViewer`, `requireMembership`, `readableOrgIds` | `src/lib/server/auth.js` |
| Store: `requestCode` / `verifyCode` / `logout` / `expire` | `src/lib/store/auth/store.js` |
| Hooks: `useLogin`, `useUser`, `useAuthed`, `useRole`, `usePrivileged`, `useGroups` | `src/lib/store/auth/hook.js` |
| Route guards (signed in vs not) | `src/components/AuthGate.jsx` |
| Role gating (what you may do) | `src/components/Auth.jsx` |
| Login screen (email → code) | `src/app/(public)/login/page.jsx` |
| Bearer header + 401 sign-out | `src/lib/api.js` |
| Viewer + memberships endpoint | `src/app/api/me/route.api.js` |

---

## Gotchas

- **Never cache the access token.** `accessToken()` refreshes it transparently; a hoisted
  copy outlives its refresh and starts 401ing mid-session.
- **`SIGNED_IN` fires on every token refresh**, not just sign-in. The store only reacts to
  `SIGNED_OUT`; the sign-in paths load the profile explicitly, or you get a `/api/me`
  request every hour for no new information.
- **A 401 signs the app out**, from `lib/api.js`, via a lazy import of the auth store (a
  top-level one would be circular). It does not navigate — the gates do that when
  `loggedIn` flips.
- **The secret key bypasses everything.** Server-only, never `NEXT_PUBLIC_`, never
  imported outside `src/lib/server/**`. Only the seed and the invite flow need it.
- **Key names changed.** `anon` → publishable (`sb_publishable_...`), `service_role` →
  secret (`sb_secret_...`); the legacy pair is deprecated at the end of 2026. Both are read,
  new preferred.
- **Never authorize on `user_metadata`.** It is user-editable and reaches `auth.jwt()`.
  The seed writes a display name there for convenience only — every authorization decision
  reads the `Profile` and `Membership` tables instead.
- **One code per address per 60 seconds.** Supabase rate-limits `/auth/v1/otp` and rejects
  anything inside that window, so the login screen counts it down (`OTP_RESEND_SECONDS`)
  rather than firing a resend into a guaranteed error. Adjustable under Authentication →
  Rate Limits; if you change it there, change the constant too.
- **Adding a provider (Google/Apple) is a native problem, not a web one.** It needs a
  custom URL scheme and the Capacitor `Browser`/`App` plugins to catch the callback. The
  store is the seam; nothing above it changes.
