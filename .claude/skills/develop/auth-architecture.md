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
- **Sessions end only when the viewer or an admin ends them.** Nothing transient — offline,
  a 503, a suspended app, a drifting device clock — may sign anyone out, and the session
  itself lives in native storage the OS won't reclaim. See "Staying signed in".
- **Two authorization axes.** `Membership.role` (ADMIN | MEMBER) is per-group permission.
  `Profile.vocation` (CATECHUMEN | FAITHFUL | READER | MATUSHKA | DEACON | PRIEST | BISHOP)
  is presentational and grants nothing.
- **Admission is the security model.** An admin adds an email, which provisions the account
  outright — there is no acceptance step and no self-serve path. Removing someone is a
  status change, not a delete.
- **Signing in is not the same as getting in.** Two more gates follow: `access` (do you
  belong to a group at all) and `onboardedAt` (have you finished orientation).
- **Route guards are client components** (`AuthGate.jsx`, `MemberGate.jsx`), because a
  static export has no server. **Real enforcement is server-side**, in
  `src/lib/server/auth.js`.

---

## The flow

```
/login  ── email ──────────► supabase.auth.signInWithOtp({ shouldCreateUser: false })
                             └─ unknown address → rejected here, no code sent
        ── code ───────────► supabase.auth.verifyOtp()      → a Supabase session exists
                           ► GET /api/me                    → the app's view of the person
                             └─ 401/no Profile → sign back out; a session alone is not entry
                           ► loggedIn = true, router.replace("/")

<ProtectedGate> signed in?          no → /login
<MemberGate>    access !== ACTIVE?  yes → /access     "your access has been removed"
                onboardedAt null?   yes → /welcome    first-run orientation
                otherwise                → the app
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

## Admission — how anyone gets in

There is one way into a parish: an admin adds an email address. That is not a convenience
layered over sign-in, it *is* the whitelist — `shouldCreateUser: false` means an address
with no `auth.users` row can never obtain a code, so provisioning and authorising are the
same act.

**Provisioned immediately, not on acceptance.** `POST /api/orgs/:orgId/invites` creates the
Supabase auth user, the `Profile`, and an **APPROVED** `Membership` in one go. The person
simply signs in whenever they like. There is no token to redeem and no public accept route,
and that is deliberate on three counts: a public route would fight the invite-only gate, it
would fight the static export, and a redemption *link* is exactly the thing that cannot work
inside the native WebView.

The `Invite` row survives as an audit trail — who admitted whom, to what role and vocation,
when. It is not a ticket, and it no longer pretends to be: the `token` / `expiresAt` /
`acceptedAt` columns are gone, because there is no link to redeem and nothing to expire.

**Admission is one-directional, and the schema enforces it.** An admin adds people; a person
never asks to join and there is nothing to approve. `MembershipStatus` is `APPROVED |
REVOKED` — no PENDING request, no REJECTED refusal — so an unapproved membership is not a
state that can be represented, and `Membership.status` defaults to `APPROVED` because
admission is the only thing that creates a row.

This follows from the invite-only gate rather than being a separate decision. A
request-to-join flow needs a public entry point where a stranger identifies themselves, and
`shouldCreateUser: false` means that stranger can never receive a sign-in code anyway — the
request would come from someone who by construction cannot act on the answer.

The earlier schema had the request half without the entry point, which is how the roster
ended up with an **Approve** button that nothing could populate and `/access` with a
"waiting on approval" screen nobody could reach. If a parish ever does want people to be
able to ask, that is a new model — a `JoinRequest` with its own table and its own gate — not
a third value on this enum.

**No email is sent.** Also deliberate: a priest can add forty people without touching a rate
limit, and telling them happens out of band, which for a parish is how it actually happens.

Consequences worth knowing:

- **A Supabase dashboard invite does not work.** It creates an auth user with no `Profile`
  and no `Membership`, so `requireViewer` throws *"This account has not been set up yet"*
  and `verifyCode` tears the session back down. It fails safe, but confusingly — use the
  app's own admissions.
- **Addresses arrive as a blob.** The endpoint splits on commas, semicolons and whitespace,
  because a list of parishioners arrives pasted, not typed. Failures are reported **per
  address** rather than aborting the batch — one typo must not cost the other twenty-nine.
- **Re-admitting is an upsert.** Adding someone previously revoked restores them rather
  than colliding.

### Removal

`PATCH /api/memberships/:id` with `status: "REVOKED"`. A status change, never a delete, so
their posts and comments stay attributed to a real person and re-admitting is one field.

**It does not remove their Supabase account** — they can still authenticate, they simply
have no group to read. That is what `/access` exists for; without it they would land in the
app and find an empty feed, which reads as breakage rather than as a decision.

An admin cannot revoke themselves. Otherwise the last admin can lock the parish out of its
own roster.

---

## The gateway — signed in, but not yet in

`access` is derived server-side in `projectViewer` and sent on the viewer, so the client
branches on one value that cannot drift from what the API would enforce:

| `access` | Means | Screen |
|---|---|---|
| `ACTIVE` | at least one APPROVED membership | the app |
| `REVOKED` | removed | `/access` |
| `NONE` | signed in, belongs to nothing | `/access` |

There is no "waiting on approval" value, because nobody can ask to join. `REVOKED` and
`NONE` stay distinct only because they need different wording — one person was removed, the
other was never attached to a parish at all — and `/access` offers the same single action
either way: sign out and talk to a person.

Orientation is the second gate. `onboardedAt` is null until the viewer completes `/welcome`,
which asks the three things **only they can supply**: their name (first and last), the
`@handle` that appears beside their comments, and their birthday. Everything else about them
— rank, role, parish — was set by the priest at admission and is deliberately not asked
again.

Those three are asked one step at a time, but written **in a single POST**. The steps are a
client-side presentation of one decision; posting per step would make "half-onboarded" a
real database state, and no screen repairs one — the gate would simply keep sending them
back to re-answer. `STEP_FOR_FIELD` in the page maps a server-side field error back to the
step that caused it, which is what lets a handle taken between the live check and the write
land the viewer on the handle question rather than on a finished form with a toast.

The handle is the one field with a live server check, `GET /api/me/onboarding/handle`. It is
**advisory** — the unique constraint in `completeOnboarding` is what actually decides — and
it exists because the handle is chosen in the middle of the flow, so leaving uniqueness to
the final submit means discovering the collision after the last question.

> A profile carries a **provisional** handle before this, derived from the email local part
> by `deriveHandle` at admission, because an admin inviting someone knows only their address.
> It can be shorter than `HANDLE_MIN` allows; nothing validates a placeholder. Orientation is
> where it is replaced by one the person chose.

### One destination, two gates

`useGatewayDestination()` returns the route a signed-in viewer belongs on: a path, `null`
for "the app", or `undefined` for "not resolved yet". **Both gates read it and neither
decides anything itself.**

That is the whole design. Two gates reasoning independently is how redirect loops get
written — one sends you to `/welcome`, the other decides you don't belong there and sends
you back, forever. Here there is a single answer and both merely obey it:

- `<MemberGate>` wraps the app shell and holds anyone with somewhere else to be.
- `<GatewayRedirect>` wraps `/welcome` and `/access` and sends you back into the app once
  you no longer belong there.

The three-valued return matters as much as the sharing. A gate that cannot tell "no
redirect needed" from "the viewer hasn't loaded" bounces people out of the app for the
fraction of a second before `/api/me` answers — and on a magic-link boot that is long
enough to see.

> **Anything else that navigates on boot must respect it too.** The callback-URL scrub in
> `useAuthInit` is gated on `destination === null` for exactly this reason: it once fired
> `router.replace("/")` a tick after `MemberGate` had redirected to `/welcome`, cancelling
> it and leaving a blank page — the gate correctly rendering nothing for a route it had
> already decided against. Two `router.replace` calls racing for the same tick is the bug;
> the shared destination is the fix.

### Testing admission and orientation locally

Two workflows, and they exercise different things.

**Rewind an existing account** — fastest loop while building the orientation screen:

```bash
npm run dev:reset-member -- admin    # clears onboardedAt, name, birthday, lastSeenAt
npm run dev:login -- admin           # sign in; lands on /welcome
```

**Admit a genuinely new person** — exercises the whole journey, including the roster
states, which the rewind cannot show you:

```bash
# In the app, as an admin: Settings → Users → paste you+newbie@yourdomain.com
npm run dev:login -- you+newbie@yourdomain.com
```

Plus-addressing gives you as many distinct accounts as you like in one inbox, and
`dev:login` means none of it costs an email. Before that account signs in the roster shows
it as **Not yet signed in**; afterwards, **Orientation pending** until `/welcome` is
completed.

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
| `requireViewer(request)` | `401 UNAUTHENTICATED` | no bearer token, token fails verification, or no Profile for its `sub` |
| | `503 UNAVAILABLE` | the check could not run (JWKS unreachable) — never a 401 |
| `requireMembership(viewer, orgId)` | `404 NOT_FOUND` | no membership |
| | `403 PERMISSION_DENIED` | REVOKED, or wrong role |
| `membershipIn(viewer, orgId)` | — | that membership, or null |
| `readableOrgIds(viewer)` | — | the APPROVED set the feed is scoped to |

**404 rather than 403 for a non-member** is deliberate: confirming a group or post exists
would leak the contents of a parish the viewer was never admitted to. Wrong-role gets 403,
because the viewer already knows the group exists.

**Only `requireViewer` is async, and only it queries.** It returns the Profile *with every
membership and its organization loaded*, and every helper after it reads that snapshot in
memory. This is not a micro-optimization: each of those checks used to be its own
statement, and a round trip to Supabase's pooler is tens of milliseconds against a query
that costs nothing. Pass the `viewer`, never `viewer.id` — the helpers throw if the
snapshot is missing rather than quietly answering "no membership", because a viewer that
reached a service without `requireViewer` is a broken call path, not a 404.

**The token is verified locally**, against the project's published JWKS with `jose`.
Supabase signs with ES256, so a public key settles it and no round trip to the auth server
is needed; issuer and audience are checked alongside the signature. Two cases fall back to
`auth.getUser(jwt)`: a project still on the legacy shared HS256 secret, and the window
during a key rotation before the new key is published.

What this gives up is *instant* revocation — a session signed out elsewhere stays
verifiable until its access token expires (an hour by default; the refresh token is
already dead, so it cannot be extended). Two things bound that: the Profile lookup, which
cuts off anyone deprovisioned, and `Membership.status`, read from the database on every
authorization decision. If revocation ever needs to bite sooner, shorten the JWT expiry in
the Supabase dashboard — do not put an HTTP call back in the path of every request.

Never trust a decoded JWT body without verifying it; the payload is base64, not a proof.

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

## Staying signed in

**Synaxis signs people in once.** Not "for a long time" — once, on that device, until they
sign out or an admin removes them. This is the same expectation Facebook and Instagram set,
and it is the right one here for the same reason: a parish feed is something you glance at
between other things, and a login screen in front of it is a wall in front of a habit. An
app that asks again next Tuesday has quietly told its readers to check it less often.

**It is deliberately not the banking posture, and that is a considered trade, not an
oversight.** A short session is a real control when the threat is a shared or stolen
terminal and the stakes are moving money. Neither holds. This is a personal phone, the
account is invite-only and provisioned by a parish admin who knows the person, and the worst
an unauthorized reader can do with the session is read a parish's posts and leave a like.
Set against that, an idle timeout buys almost nothing and costs the thing the app is for.
Revocation is where the security actually lives, and it is unaffected: `Membership.status`
is read from the database on **every** authorization decision, so removing someone bites on
their next request regardless of how old their session is.

So the rule the whole client obeys:

> **Only a 401 that has survived a forced token refresh may end a session.** Everything else
> — a dropped connection, a 503, a timeout, a device clock a minute fast — is the question
> going unanswered, and an unanswered question changes nothing.

Four things were signing people out, none of which was ever a real sign-out.

**1. The session lived in the WebView's `localStorage`.** That is *website data*, which both
mobile platforms treat as a cache they may reclaim — iOS purges `WKWebView` storage under
disk pressure and around app updates, Android's goes with a "clear cache". On native the
session is now written through Capacitor **Preferences** (`UserDefaults` /
`SharedPreferences`), which is *application* data and survives all of it. See
`nativeStorage` in `lib/supabase.js`; its read falls back to `localStorage` once and copies
the value across, so the release that fixed this did not itself sign everyone out.

**2. A token that couldn't be refreshed looked identical to no token.** `accessToken()`
returned `string | null`, and null meant both "signed out" and "on a train". The second was
sent anonymously, earned a 401, and got signed out for it. `sessionToken()` returns
`{ token, stale }` instead — supabase-js reports a genuine absence as
`{ session: null, error: null }` and a failed refresh as `{ session: null, error }`, with
the refresh token still on disk — and `api.js` throws `NETWORK` rather than sending a
request it knows will 401.

**3. A single 401 was a verdict.** It now buys one forced `refreshSession()` and one retry.
A 401 means the server did nothing, so replaying even a POST is safe, and clock skew /
a token that aged out in flight / a half-finished key rotation all resolve silently.

**4. Timers don't run while an app is suspended.** A phone asleep for two hours wakes with
an expired access token and a refresh ticker that hasn't fired since. On native the store
drives it from Capacitor's `appStateChange` — `startAutoRefresh()` on resume (it ticks
immediately), `stopAutoRefresh()` on background so a refresh can't be *in flight* when the
OS freezes the process, which rotates the refresh token into a void. The web keeps
supabase-js's own `visibilitychange` handling; `startAutoRefresh()` removes it, so calling
it there would be a downgrade.

Alongside those, `init()` no longer clears the viewer when `/api/me` fails transiently. It
sets `stale` instead: the persisted profile stays on screen, the app opens on its cached
feed, and `resume()` — or the next `TOKEN_REFRESHED` — reconciles when the connection is
back. The one case that still signs out is a transient failure with *nothing cached*, since
the shell around a null viewer is a blank screen.

Two knobs live in the Supabase dashboard rather than in code, and both can end a session no
matter what any of the above does. Under **Authentication → Sessions**: *time-box user
sessions* and *inactivity timeout*, off by default. **Leave them off.** Turning either on is
how you undo this entire section from a web form, with nothing in the repo to show for it —
and the reason not to is the one at the top, not an oversight to be tidied up later. The
same page holds **JWT expiry**, which is a different thing: it is the access token's
lifetime, it does not end sessions, and it is the revocation window
`lib/server/auth.js` trades for skipping a `getUser()` round trip per request. Shortening
*that* is the sanctioned lever if a parish ever needs revocation to bite sooner.

---

## The two axes

Conflating these is the mistake the schema is shaped to prevent.

| | Values | Scope | Grants |
|---|---|---|---|
| `Membership.role` | `ADMIN`, `MEMBER` | **per group** | ADMIN may publish; MEMBER may read, like, comment |
| `Profile.vocation` | `CATECHUMEN`, `FAITHFUL`, `READER`, `MATUSHKA`, `DEACON`, `PRIEST`, `BISHOP` | global | nothing — it is a label |

A priest is *usually* their parish's admin but need not be, and an admin need not be a
priest — a parish can have a Reader who administers the feed and a Priest who does not.
Because roles are per-group, `useRole(orgId)` / `usePrivileged(role, orgId)` always resolve
against one group; a global "am I admin" would paper over that the moment a second group
exists.

Vocation is **one value, never a set** — these standings are mutually exclusive, so nobody
is both a matushka and an ordained reader. That is why it is an enum column rather than a
collection of flags: the schema makes the invalid combination unrepresentable instead of
leaving it to validation. It is set by an admin at admission and editable on the roster
afterwards, because people are tonsured and ordained over a life in the parish.

> **The enum's declaration order is the sort order.** Postgres orders an enum by physical
> position, not alphabetically, and the roster sorts on it. Adding a rank means placing it
> — `ALTER TYPE … ADD VALUE 'X' AFTER 'Y'`, not a bare `ADD VALUE`, which appends and would
> sort a matushka below a bishop. Prisma generates the bare form; edit the migration.
> Moving an *existing* label is not possible with `ADD VALUE` at all and needs a type
> recreate (see `20260817212259_member_lifecycle`).

`MembershipStatus` is the third piece: only `APPROVED` puts a group's posts in a viewer's
feed, and it is what `access` is derived from.

### Lifecycle timestamps

Two nullable columns on `Profile` carry the states the roster shows and the gates act on:

| Column | Null means | Set by |
|---|---|---|
| `lastSeenAt` | **never signed in** — the invitation has not been taken up | `touchProfile` on `/api/me`, throttled to 10 minutes |
| `onboardedAt` | orientation unfinished | `POST /api/me/onboarding` |

They are kept here rather than read from `auth.users.last_sign_in_at`, which is visible
today but lives in a schema Supabase owns and has been progressively locking down.

---

## Files

| Concern | File |
|---|---|
| Browser client, native session storage, `sessionToken()` / `refreshSession()` / auto-refresh control | `src/lib/supabase.js` |
| Foreground/background signal (`onAppState`) | `src/lib/native.js` |
| RLS + Data API lockdown | `prisma/policies.sql` (`npm run db:secure`) |
| Server clients (anon + service role) | `src/lib/server/supabase.js` |
| `requireViewer`, `requireMembership`, `readableOrgIds` | `src/lib/server/auth.js` |
| Admissions, roster, onboarding, revoke | `src/lib/server/profile.service.js` |
| `access` derivation | `accessFor` in `src/lib/server/projections.js` |
| Store: `requestCode` / `verifyCode` / `completeOnboarding` / `logout` / `expire` / `resume` / `suspend` | `src/lib/store/auth/store.js` |
| Hooks: `useLogin`, `useUser`, `useAuthed`, `useRole`, `usePrivileged`, `useGatewayDestination`, `useOnboarding`, `useAuthInit` | `src/lib/store/auth/hook.js` |
| Roster store + hook (invite, approve, revoke, re-rank) | `src/lib/store/members/` |
| Route guards (signed in vs not) | `src/components/AuthGate.jsx` |
| Gateway guards (do you belong / orientation) | `src/components/MemberGate.jsx` |
| Role gating (what you may do) | `src/components/Auth.jsx` |
| Shared chrome for login / welcome / access | `src/components/GatewayShell.jsx` |
| Login screen (email → code) | `src/app/(public)/login/page.jsx` |
| Orientation + access-removed screens | `src/app/(gateway)/` |
| Birthday drum picker | `src/components/DateWheel.jsx` |
| Admin roster UI (invite, revoke, vocation) | `src/app/(protected)/settings/users/page.jsx` |
| Bearer header + 401 sign-out | `src/lib/api.js` |
| Endpoints | `src/app/api/me/`, `me/onboarding/`, `orgs/[orgId]/invites/`, `memberships/[membershipId]/` |
| Dev sign-in without email | `scripts/dev-login.mjs` (`npm run dev:login`) |

---

## Gotchas

- **Never cache the access token.** `sessionToken()` refreshes it transparently; a hoisted
  copy outlives its refresh and starts 401ing mid-session.
- **A missing token is not a signed-out viewer.** `sessionToken()` returns `{ token, stale }`
  for exactly this reason — `stale` means the session is on disk but could not be refreshed
  right now. Never collapse the two back into a nullable string. See "Staying signed in".
- **Never add a second path that calls `expire()`.** The one in `lib/api.js` is the only
  thing in the app that ends a session the viewer did not ask to end, and it only fires on a
  401 that has already survived a forced refresh.
- **Native session storage is Capacitor Preferences, not `localStorage`**, because a WebView's
  storage is a cache the OS may reclaim. `nativeStorage` in `lib/supabase.js` migrates the
  legacy key on first read — don't remove that fallback until every install has updated.
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
- **Nothing else may navigate on boot without consulting `useGatewayDestination()`.** Two
  `router.replace` calls in the same tick means the last one wins, and the loser's gate is
  left rendering nothing — a blank page. See the callback scrub in `useAuthInit`.
- **`/welcome` and `/access` are their own route group**, not part of `(protected)`, so they
  do not wear the app shell. Rendering a Home tab around "your access has been removed"
  would offer a home to someone who has none.
- **The roster distinguishes three lifecycle states, not two.** "Not yet signed in" and
  "orientation pending" are different problems with different remedies — someone who has
  never signed in may not know they were added. Collapsing them into "inactive" loses the
  distinction that decides which of the two you go and talk to.
