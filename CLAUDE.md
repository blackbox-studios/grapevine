# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Synaxis** (synaxis.chat) is a **Next.js 15 (App Router) on React 19** app for Orthodox parishes and dioceses, which also ships as a native iOS/Android app via **Capacitor**.

**Invite-only, organization-scoped.** People belong to groups (a parish, a diocese) through a `Membership`. A viewer's feed is the union of the groups they hold an **APPROVED** membership in — there is no unscoped read anywhere in the API. Only a group **ADMIN** may publish into it; ordinary members read, like, and comment.

**There is a real API and a real database.** The app is client-rendered (pages/layouts are Client Components) and talks HTTP to Next **route handlers** under `src/app/api/**/route.api.js`, which query **Postgres on Supabase** through **Prisma**. Only the dashboard surface in the `app` store is still in-session mock. See `.claude/skills/develop/backend-architecture.md`.

**Two build targets, one codebase.** `npm run build` produces the Node server build — the only one that can host the API. `npm run build:native` produces a **static export** in `out/` that Capacitor packages. The static target is the constraining one: it forbids middleware, intercepting routes, and route handlers, and every dynamic segment needs `generateStaticParams`. See `.claude/skills/develop/native-architecture.md`.

> **Route handlers must be named `route.api.js`, not `route.js`.** `pageExtensions` in `next.config.mjs` only treats `api.js` as a route in the Node build, which is what makes the whole `src/app/api/**` tree invisible to the static export. Name one `route.js` and the native build breaks — possibly days later, in CI. The native app therefore cannot use same-origin `/api`; point it at a deployed instance with `NEXT_PUBLIC_API_BASE_URL`.

> **Do not add `src/middleware.js`.** Vendor quickstarts (Supabase, NextAuth, Clerk) all tell you to, and it is the single most damaging thing you can do here: `output: "export"` drops middleware **silently** — no build error, no runtime error, the app just ships with no auth gate. Route protection belongs in `src/components/AuthGate.jsx`. The same applies to Server Actions, `cookies()`/`headers()`, and any native code path that depends on `src/app/api/**`. Read the "Adding a library" section of `native-architecture.md` before wiring up an auth or data SDK.

**The database is live.** `prisma/schema.prisma` is the domain — read its header first, it explains the two decisions that carry the design. It needs **two** connection URLs, and the split is required rather than an optimization: `DATABASE_URL` (Supabase transaction pooler, port 6543) for the app at runtime, and `DIRECT_URL` (port 5432) for migrations, because Prisma Migrate's advisory locks and DDL do not survive a pooler. Pagination is keyset, not offset, and identifiers are snake_case in Postgres via `@@map`.

**`npm run db:secure` must follow every migration.** It applies `prisma/policies.sql`, which enables RLS and revokes the `anon`/`authenticated` grants. Supabase auto-generates a REST API over the `public` schema that answers to the publishable key compiled into our own client bundle — without that lockdown it serves every parish's posts, bypassing the entire `/api` authorization layer.

**Two authorization axes, deliberately not merged.** `Membership.role` (ADMIN | MEMBER) is per-group permission. `Profile.vocation` (PRIEST | FAITHFUL) is who someone is and grants nothing — a priest is usually their parish's admin but need not be, and an admin need not be a priest.

Not a monorepo — the whole project is a single npm package rooted at the repo top level. Next.js App Router, Zustand, `motion`.

## Frontend architecture

- **Strict layering: API → store → hook → component.** `src/lib/api.js` is the only thing that fetches, stores are the only thing that calls it, and hooks are the only thing that touches a store. `api.js` also attaches the Supabase bearer token per request and signs out on a 401. The `feed`, `post`, `comments`, `auth`, and `members` stores are API-backed (`{ items, nextCursor }`, cursors opaque); only `app` is still in-session.
- **The list and the open post are separate stores.** `feed` owns the paginated list; `post` owns the open post and every write to a post (likes, comment tallies), applying each one to both its own copy and the feed's row through `patchPost` — otherwise a heart filled in the overlay empties again when it's dismissed. `comments` → `post` → `feed` is the dependency direction; keep it that way.
- **Post detail is fetched at runtime, by id.** Opening a post promotes the feed's cached row synchronously — so the photo the reader just tapped paints on the first frame with no skeleton — then refreshes it from `/api/posts/:id` silently in the background. That's what lets post ids be unknown at build time, which the static export requires.
- **No simulated latency.** Reads hit Postgres. `MOCK_LATENCY_MS` survives for one consumer — the `app` store, which has no endpoint yet — and stores must not add a `mockDelay` floor of their own.
- **Auth is Supabase, an emailed one-time code** (8 digits here — a dashboard setting, mirrored as `OTP_LENGTH`; most docs say 6 and are wrong for this project). A code rather than a magic link because a Capacitor WebView has no origin to redirect back to. **The Magic Link email template must contain `{{ .Token }}` or no code is ever sent.** Supabase's built-in SMTP also only delivers to organization team addresses, so `SEED_ADMIN_EMAIL` / `SEED_MEMBER_EMAIL` should point at inboxes you control, and real use needs custom SMTP. See `.env.example`. Invite-only is one option: `signInWithOtp({ shouldCreateUser: false })` means an address with no account can never be sent a code. Supabase owns the *session*; `GET /api/me` owns the *viewer* (profile, vocation, role, groups) — `loggedIn` means both are in place. Route protection is client-side (`<ProtectedGate>` / `<PublicGate>` in `src/components/AuthGate.jsx`) and role gating is `<Privileged>` in `src/components/Auth.jsx`, but **both are presentation** — real enforcement is `requireViewer` / `requireMembership` in `src/lib/server/auth.js`. See `.claude/skills/develop/auth-architecture.md`.
- **Slide routes are shallow history.** Opening a post changes the URL with `history.pushState` so the feed behind it stays mounted; dismissing is `history.back()`, which is also why Android's back button works on it for free. See the Slide routes section of `frontend-architecture.md`.

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
