# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Synaxis** (synaxis.chat) is a **Next.js 15 (App Router) on React 19** app for Orthodox parishes and dioceses, which also ships as a native iOS/Android app via **Capacitor**.

**Invite-only, organization-scoped.** People belong to groups (a parish, a diocese) through a `Membership`. What a viewer may read is the union of the groups they hold an **APPROVED** membership in — there is no unscoped read anywhere in the API. Only a group **ADMIN** may publish into it; ordinary members read, like, and comment.

**One group is selected at a time, and it is the app's context.** The `org` store holds that selection and the group switcher changes it; the feed, the roster, invites, and every admin control resolve against it, so the same session offers a composer in a parish someone administers and none in a diocese they merely belong to. `orgId` is an optional filter on `GET /api/feed` — it can only narrow the viewer's own scope, never widen it, because the service runs `requireMembership` on it. In code a group is an **`org`** (`Organization`, `orgId`, `/api/orgs`, `useCurrentOrg`); in the interface it is always called a **Group**.

**Admission is one-directional: an admin adds people, and a person never asks to join.** There is no request, no approval queue, and nothing to accept — `MembershipStatus` is `APPROVED | REVOKED` precisely so an unapproved membership cannot be represented. This falls out of the invite-only gate: `signInWithOtp({ shouldCreateUser: false })` means someone with no account can never receive a code, so a join request would come from a person who by construction cannot act on the answer. Adding someone provisions their Supabase user, `Profile`, and an APPROVED `Membership` in one step; they simply sign in. If a parish ever needs people to be able to ask, that is a new `JoinRequest` model with its own gate — **not** a third value on this enum. Putting the request half back without the entry point is what produced a roster with an Approve button nothing could populate.

**There is a real API and a real database.** The app is client-rendered (pages/layouts are Client Components) and talks HTTP to Next **route handlers** under `src/app/api/**/route.api.js`, which query **Postgres on Supabase** through **Prisma**. Only the dashboard surface in the `app` store is still in-session mock. See `.claude/skills/develop/backend-architecture.md`.

**Two build targets, one codebase.** `npm run build` produces the Node server build — the only one that can host the API. `npm run build:native` produces a **static export** in `out/` that Capacitor packages. The static target is the constraining one: it forbids middleware, intercepting routes, and route handlers, and every dynamic segment needs `generateStaticParams`. See `.claude/skills/develop/native-architecture.md`.

> **Route handlers must be named `route.api.js`, not `route.js`.** `pageExtensions` in `next.config.mjs` only treats `api.js` as a route in the Node build, which is what makes the whole `src/app/api/**` tree invisible to the static export. Name one `route.js` and the native build breaks — possibly days later, in CI. The native app therefore cannot use same-origin `/api`; point it at a deployed instance with `NEXT_PUBLIC_API_BASE_URL`.

> **Do not add `src/middleware.js`.** Vendor quickstarts (Supabase, NextAuth, Clerk) all tell you to, and it is the single most damaging thing you can do here: `output: "export"` drops middleware **silently** — no build error, no runtime error, the app just ships with no auth gate. Route protection belongs in `src/components/AuthGate.jsx`. The same applies to Server Actions, `cookies()`/`headers()`, and any native code path that depends on `src/app/api/**`. Read the "Adding a library" section of `native-architecture.md` before wiring up an auth or data SDK.

**The database is live.** `prisma/schema.prisma` is the domain — read its header first, it explains the two decisions that carry the design. Both connection URLs go through Supabase's **session** pooler on port 5432: `DATABASE_URL` for the app at runtime (the web target is one long-lived Node server, so it gets prepared statements and one round trip per query — the transaction pooler on 6543 forces a `BEGIN`/`DEALLOCATE ALL`/`COMMIT` around every single query and measured ~2.5x the round trips), and `DIRECT_URL` for migrations, whose advisory locks and DDL do not survive a transaction pooler at all. Pagination is keyset, not offset, and identifiers are snake_case in Postgres via `@@map`.

**Latency here is round trips, not queries.** Against a pooler in another region each statement costs tens of milliseconds and the SQL costs under one, so the API is written to *count statements*: `relationLoadStrategy: "join"` (preview feature `relationJoins`) collapses an `include` into one query instead of one per relation, `requireViewer` loads the viewer's memberships with the profile so no authorization check queries again, and the bearer token is verified locally against the project's JWKS with `jose` rather than by calling Supabase per request. See the "Round trips are the cost" section of `backend-architecture.md` before adding a query to a request path.

**`npm run db:secure` must follow every migration.** It applies `prisma/policies.sql`, which enables RLS and revokes the `anon`/`authenticated` grants. Supabase auto-generates a REST API over the `public` schema that answers to the publishable key compiled into our own client bundle — without that lockdown it serves every parish's posts, bypassing the entire `/api` authorization layer.

**Two authorization axes, deliberately not merged.** `Membership.role` (ADMIN | MEMBER) is per-group permission. `Profile.vocation` (PRIEST | FAITHFUL) is who someone is and grants nothing — a priest is usually their parish's admin but need not be, and an admin need not be a priest.

**Names and the blue check are composed, not stored.** `Profile` holds `firstName`, `lastName`, `handle` and `vocation`, and there is **no `fullName` column and no `verified` column** — both were removed because a stored display string cannot serve the feed (which addresses clergy as "Dn. Paul") and the roster (which sorts on the surname) at once, and a profile-wide verified flag could disagree with the admin role it claimed to describe. The API ships name *parts*; `displayName()` / `fullName()` / `initials()` in `src/lib/name.js` are the only place they become a name, and `VOCATION_TITLE` in `constants.js` is the only place a title is written down. The check is derived per post from `Membership.role == ADMIN` in that post's group, so the same person can carry it in the parish they administer and not in their diocese. Name, handle and birthday are collected once, step by step, at `/welcome`.

Not a monorepo — the whole project is a single npm package rooted at the repo top level. Next.js App Router, Zustand, `motion`.

## Frontend architecture

- **Strict layering: API → store → hook → component.** `src/lib/api.js` is the only thing that fetches, stores are the only thing that calls it, and hooks are the only thing that touches a store. `api.js` also attaches the Supabase bearer token per request and signs out on a 401. The `feed`, `post`, `comments`, `auth`, `members`, and `notifications` stores are API-backed (`{ items, nextCursor }`, cursors opaque); only `app` is still in-session. `org` fetches nothing at all — it holds the selected group and the switcher's open state, and the list of groups it selects between comes from the viewer.
- **The list and the open post are separate stores.** `feed` owns the paginated list; `post` owns the open post and every write to a post (likes, comment tallies), applying each one to both its own copy and the feed's row through `patchPost` — otherwise a heart filled in the overlay empties again when it's dismissed. `comments` → `post` → `feed` is the dependency direction; keep it that way.
- **Post detail is fetched at runtime, by id.** Opening a post promotes the feed's cached row synchronously — so the photo the reader just tapped paints on the first frame with no skeleton — then refreshes it from `/api/posts/:id` silently in the background. That's what lets post ids be unknown at build time, which the static export requires.
- **No simulated latency on anything with an endpoint.** Reads hit Postgres, and a warm feed page answers in ~0.3s, so a floor on an API-backed store would now be the slowest thing in the request. `MOCK_LATENCY_MS` survives for one consumer — the `app` store, whose dashboard surface has no endpoint yet and would otherwise resolve in zero milliseconds and flash its skeleton — and stores must not add a `mockDelay` floor of their own.
- **Auth is Supabase, an emailed one-time code** (8 digits here — a dashboard setting, mirrored as `OTP_LENGTH`; most docs say 6 and are wrong for this project). A code rather than a magic link because a Capacitor WebView has no origin to redirect back to. **The Magic Link email template must contain `{{ .Token }}` or no code is ever sent.** Supabase's built-in SMTP also only delivers to organization team addresses, so `SEED_ADMIN_EMAIL` / `SEED_MEMBER_EMAIL` should point at inboxes you control, and real use needs custom SMTP. See `.env.example`. Invite-only is one option: `signInWithOtp({ shouldCreateUser: false })` means an address with no account can never be sent a code. Supabase owns the *session*; `GET /api/me` owns the *viewer* (profile, vocation, role, groups) — `loggedIn` means both are in place. Route protection is client-side (`<ProtectedGate>` / `<PublicGate>` in `src/components/AuthGate.jsx`) and role gating is `<Privileged>` in `src/components/Auth.jsx`, but **both are presentation** — real enforcement is `requireViewer` / `requireMembership` in `src/lib/server/auth.js`. See `.claude/skills/develop/auth-architecture.md`.
- **A session ends only when the viewer or an admin ends it.** Synaxis signs someone in once on a device and stays that way, like every social app and unlike a bank: a parish feed is glanced at between other things, and a login screen in front of it teaches people to check it less often. The short-session posture defends a shared terminal holding money; this is a personal phone, invite-only, where the worst an unauthorized reader does is read posts. Revocation carries the security instead — `Membership.status` is read from the database on every authorization decision, so removing someone bites on their next request however old their session is. Nothing transient may end a session: only a 401 that has already survived a forced `refreshSession()` reaches `expire()`, `sessionToken()` reports "session on disk, no token right now" as `stale` rather than as signed-out, `init()` keeps the cached viewer when `/api/me` fails transiently, and on native the session lives in Capacitor **Preferences** (`UserDefaults`/`SharedPreferences`) because a WebView's `localStorage` is website data the OS may reclaim. Token refresh follows the app in and out of the foreground via `appStateChange`. See the "Staying signed in" section of `auth-architecture.md` before touching `lib/api.js`, `lib/supabase.js`, or the auth store's `init`.
- **Slide routes are shallow history.** Opening a post changes the URL with `history.pushState` so the feed behind it stays mounted; dismissing is `history.back()`, which is also why Android's back button works on it for free. `/p/:id` and `/notifications` are both one, and both are built from `<SlideSurface/>` + `useSlideDismiss()` rather than from their own copies of that behaviour. They **stack** — a notification opens the post it is about *over* the list, and back uncovers the list — which is why `openedStack` is a list of paths and what is open is derived from the URL rather than mutated on navigation. See the Slide routes section of `frontend-architecture.md`.
- **Notifications are per person, not per group — the one read in the app that is not scoped to the selection.** A like on your post or comment, or a new post from an admin of a group you belong to, writes a `Notification` row in the same transaction as the event itself, so the two cannot drift; the bell counts unread and clears when the panel opens. The bell lives in the desktop nav rail as a popover and at the top right of the mobile feed as a slide route, and both render the same `<NotificationList/>`. Push notifications (Firebase) are planned and change none of this — the row is the notification, a push is one delivery of it. See the header of `src/lib/server/notifications.service.js`, which also carries the game plan for grouping ("and 9 others").
- **The account surface is `/profile`, and it is where Settings and the roster are reached from.** It replaced a nav popover *and* the two-column tab rail inside Settings, which expressed the same handful of destinations twice and pushed the roster table off the right edge of a phone. The check and the role it shows describe the **selected** group, not the viewer globally.

Full patterns and conventions: `.claude/skills/develop/frontend-architecture.md`. The API contract and server layer: `.claude/skills/develop/backend-architecture.md`.

## Development Commands

```bash
npm install              # install deps (runs `prisma generate`)
npm run dev              # Next dev server at :3000
npm run build            # production build → .next/
npm run start            # serve the production build
npm run lint             # eslint (max-warnings 0)

npm run build:native     # static export → out/ (the bundle Capacitor ships)
npm run sync             # build:native + cap sync (push assets into android/ and ios/)
npm run ios              # sync + open Xcode
npm run android          # sync + open Android Studio

npm run prisma:generate  # regenerate the Prisma client from the schema
npm run prisma:migrate   # create/apply a dev migration (uses DIRECT_URL)
npm run db:secure        # RLS + revoke Data API grants — after EVERY migration
npm run prisma:seed      # Holy Trinity Cathedral, its people, and the post corpus
npm run db:reset         # DESTRUCTIVE: drop, re-migrate, re-secure, re-seed
npm run prisma:studio    # open Prisma Studio

npm run storage:setup    # create/reconcile the "media" Storage bucket — once per environment

npm run dev:login              # print a sign-in link for the seeded admin (no email sent)
npm run dev:login -- member    # ...or the seeded member
```

`dev:login` exists because Supabase's built-in SMTP allows only **2 emails per hour**
project-wide, which is not enough to develop against. It mints the same token through the
Admin API and prints it, consuming no quota. Local script only — the secret key it needs
must never sit behind a route.

Seeding provisions two real sign-innable accounts from `SEED_ADMIN_EMAIL` (Priest, ADMIN)
and `SEED_MEMBER_EMAIL` (Faithful, MEMBER), so both sides of the permission model can be
demonstrated. Everyone else is a profile with no credentials.

Seeding is never automatic — the CLI does not run it after a migrate. `db:reset` passes
`--skip-seed` on purpose, because the seed has to land *after* `db:secure`. And
`prisma migrate reset` is blocked for AI agents without explicit consent; that guard is
correct, so run a reset yourself rather than asking an agent to work around it.

## Deploying

**Web** deploys as a Node server: `npm run build` then `npm run start` (`next start`). This is the target that serves `/api`, and it's also what makes `/p/:id` deep links work. It requires `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `SUPABASE_SECRET_KEY` is only needed for seeding and invites, and must never be exposed to the client. Set `NEXT_PUBLIC_BASE_PATH` only if serving under a subpath. See `.env.example`.

**Native** ships from the static export: `npm run ios` / `npm run android` builds `out/`, syncs it into the native project, and opens the platform IDE to archive from there. Re-run `npm run sync` after any web change — the native projects hold a copy of `out/`, not a live reference. The export contains no API, so a native build needs `NEXT_PUBLIC_API_BASE_URL` pointing at a deployed instance. The Supabase URL and anon key are inlined at build time too, so re-sync after changing either.

> `build:native` overwrites `.next` with the export, so `npm run start` afterwards serves a build with no `/api`. Re-run `npm run build` before `npm run start` if you've built native in between.
