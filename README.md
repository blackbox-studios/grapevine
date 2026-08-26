# Grapevine

Grapevine ([throughgrapevine.com](https://throughgrapevine.com)) is a private social feed for
Orthodox parishes and dioceses — a **Next.js 15 (App Router) + React 19** app that also ships
as a native iOS and Android app through **Capacitor**, from one codebase.

It is **invite-only and organization-scoped**. People belong to groups (a parish, a diocese)
through a membership, and what a viewer may read is the union of the groups they belong to —
there is no unscoped read anywhere in the API. Only a group's admin may publish into it;
everyone else reads, likes, and comments. An admin adds people; nobody asks to join.

There is a real API and a real database: the app is client-rendered and talks HTTP to Next
route handlers under `src/app/api/`, which query **Postgres on Supabase** through **Prisma**.

## Quick start

You need a Supabase project (Postgres + Auth + Storage) before the app will do anything —
there is no mock mode to fall back on.

```bash
npm install                    # also runs `prisma generate`
cp .env.example .env.local     # then fill it in — it documents every value
npm run db:up                  # start the local Postgres container
npm run prisma:migrate         # create the tables
npm run db:secure              # REQUIRED — see below
npm run db:seed                # two groups, a roster, and a post corpus
npm run storage:setup          # create the "media" bucket, once per environment
npm run dev                    # http://localhost:3000
```

Develop against the container, not against the parish's live database. `docker-compose.yml`
runs Postgres on `127.0.0.1:54322`; point `DATABASE_URL` and `DIRECT_URL` there. It isolates
Postgres only — Supabase Auth and Storage stay hosted, so the same accounts sign in and
`dev:login` still works. Both destructive commands (`db:seed`, `db:reset`) refuse to run
against a non-local host.

`.env.example` is the committed source of truth for configuration and explains each value
in place, including why the database needs two connection URLs and how email delivery is
set up. Read it rather than guessing.

> **`npm run db:secure` must follow every migration.** It applies `prisma/policies.sql`,
> which enables row-level security and revokes the `anon`/`authenticated` grants. Supabase
> auto-generates a REST API over the `public` schema that answers to the publishable key
> compiled into our own client bundle — without that lockdown it serves every parish's
> posts, bypassing the entire `/api` authorization layer.

### Signing in

Sign-in is an emailed one-time code (6 digits), not a password and not a magic link — a
Capacitor WebView has no origin for a link to redirect back to. Since the app is invite-only,
an address with no account can never be sent a code.

For development, don't use your inbox:

```bash
npm run dev:login              # print a sign-in code for the seeded admin
npm run dev:login -- member    # ...or the seeded member
```

It mints the same token through the Admin API and prints it rather than mailing it, so it
consumes no email quota and works on a device as well as in a browser. Seeding provisions
two real sign-innable accounts — an ADMIN priest who can publish and a MEMBER layperson who
cannot — so both sides of the permission model can be demonstrated.

Production email goes out over Resend from `no-reply@throughgrapevine.com`; the host, ports
and DNS records are documented in `.env.example`.

## Two build targets, one codebase

```bash
npm run build            # Node server build → .next/   (the only target that serves /api)
npm run start            # serve it

npm run build:native     # static export → out/         (the bundle Capacitor ships)
npm run sync             # build:native + cap sync
npm run ios              # sync + open Xcode
npm run android          # sync + open Android Studio
```

The static export is the constraining target: it forbids middleware, intercepting routes,
and route handlers, and every dynamic segment needs `generateStaticParams`.

> **Route handlers are named `route.api.js`, not `route.js`.** `pageExtensions` in
> `next.config.mjs` only treats `api.js` as a route in the Node build, which is what makes
> the whole `src/app/api/` tree invisible to the static export. Name one `route.js` and the
> native build breaks — possibly days later, in CI.

> **Do not add `src/middleware.js`.** Vendor quickstarts all tell you to, and `output:
> "export"` drops middleware *silently* — no build error, no runtime error, the app just
> ships with no auth gate. Route protection lives in `src/components/AuthGate.jsx`.

Because the export contains no API, a native build must point at a deployed instance via
`NEXT_PUBLIC_API_BASE_URL`. Re-run `npm run sync` after any web change — `android/` and
`ios/` hold a *copy* of `out/`, not a live reference. Note that `build:native` overwrites
`.next`, so re-run `npm run build` before `npm run start` if you've built native in between.

## Database

```bash
npm run db:up            # start the local Postgres container
npm run db:down          # stop it, keeping the data
npm run db:nuke          # stop it and delete the volume

npm run prisma:migrate   # create/apply a dev migration
npm run db:secure        # RLS + revoke Data API grants — after EVERY migration
npm run db:seed          # DEV: two groups, a roster, the post corpus (local only)
npm run db:seed:prod     # PROD: one group, two admins, no posts — idempotent, additive
npm run prisma:studio    # browse the data
npm run db:reset         # DESTRUCTIVE: drop, re-migrate, re-secure, re-seed (local only)
```

**Two seeds, and the difference is not the row count.** `prisma/seed.dev.js` owns its fixture
ids and deletes and rewrites them on every run. `prisma/seed.prod.js` contains no delete at
all: it guarantees *access* — the two admins exist, confirmed, with APPROVED ADMIN
memberships — and writes content only when creating a row. Names, handles and the group's own
name are left alone forever after, because they belong to the people who set them in the app.
`prisma/seed.js` only chooses between the two.

`prisma/schema.prisma` is the domain — read its header first; it explains the two decisions
that carry the design. Seeding is never automatic: it has to land *after* `db:secure`, which
is why `db:reset` passes `--skip-seed` and re-seeds itself.

## Lint

```bash
npm run lint             # eslint, --max-warnings 0
```

## Layout

```
src/
  app/
    (public)/       login — reachable signed out
    (gateway)/      welcome, access — signed in but not yet through onboarding
    (protected)/    feed, profile, settings, inbox
    api/            route handlers (route.api.js), Node build only
  lib/
    api.js          the only thing that fetches; attaches the bearer token
    store/          zustand stores — feed, post, comments, auth, members,
                    notifications, org, uploads, app
    server/         services, authorization, cursors, storage — server only
    hooks/          shared hooks
    providers/      Theme, Tooltip, Scroll
    name.js         the only place name parts become a display name
  components/       UI, with shadcn/Radix primitives under ui/
prisma/
  schema.prisma     the domain
  policies.sql      RLS + grant revocation, applied by db:secure
scripts/            db:secure, seeding, dev:login, icon generation
android/, ios/      Capacitor native projects (hold a copy of out/)
```

Layering is strict and enforced by convention: **API → store → hook → component**.
`src/lib/api.js` is the only thing that fetches, stores are the only thing that call it, and
hooks are the only thing that touch a store.

## Stack

- Next.js 15 (App Router), React 19, Tailwind CSS 4
- Zustand (immer), react-hook-form, Zod, `motion`
- UI: shadcn / Radix primitives under `src/components/ui/`
- Prisma 6 against Postgres on Supabase
- Supabase Auth (email OTP), verified locally per request with `jose`
- Capacitor 8 (iOS + Android) over a static export

## Documentation

- `CLAUDE.md` — the project's canonical rules, auto-loaded by Claude Code. Start here.
- `.env.example` — every environment value, and why.
- `.claude/skills/develop/frontend-architecture.md` — patterns, stores, slide routes, UI.
- `.claude/skills/develop/backend-architecture.md` — the API contract and the server layer.
- `.claude/skills/develop/auth-architecture.md` — sessions, the OTP flow, staying signed in.
- `.claude/skills/develop/native-architecture.md` — the Capacitor build and its constraints.
