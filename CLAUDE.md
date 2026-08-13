# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Synaxis** (synaxis.chat) is a **Next.js 15 (App Router) on React 19** app template that also ships as a native iOS/Android app via **Capacitor**. It is intentionally lightweight, but structured so you can build a full product on top of it.

**There is a real API; there is no database behind it yet.** The app is client-rendered (pages/layouts are Client Components) and talks HTTP to Next **route handlers** under `src/app/api/**/route.api.js` for posts and comments — paginated, with optimistic writes. Those handlers read a mock corpus in `src/lib/server/seed.js` and mutate it in the Node process, so swapping in Prisma is a change to `src/lib/server/*.service.js` and nothing above it. The remaining entities (users, dashboard cards, events) are still client-side seed in `src/lib/metadata.js`. See `.claude/skills/develop/backend-architecture.md`.

**Two build targets, one codebase.** `npm run build` produces the Node server build — the only one that can host the API. `npm run build:native` produces a **static export** in `out/` that Capacitor packages. The static target is the constraining one: it forbids middleware, intercepting routes, and route handlers, and every dynamic segment needs `generateStaticParams`. See `.claude/skills/develop/native-architecture.md`.

> **Route handlers must be named `route.api.js`, not `route.js`.** `pageExtensions` in `next.config.mjs` only treats `api.js` as a route in the Node build, which is what makes the whole `src/app/api/**` tree invisible to the static export. Name one `route.js` and the native build breaks — possibly days later, in CI. The native app therefore cannot use same-origin `/api`; point it at a deployed instance with `NEXT_PUBLIC_API_BASE_URL`.

> **Do not add `src/middleware.js`.** Vendor quickstarts (Supabase, NextAuth, Clerk) all tell you to, and it is the single most damaging thing you can do here: `output: "export"` drops middleware **silently** — no build error, no runtime error, the app just ships with no auth gate. Route protection belongs in `src/components/AuthGate.jsx`. The same applies to Server Actions, `cookies()`/`headers()`, and any native code path that depends on `src/app/api/**`. Read the "Adding a library" section of `native-architecture.md` before wiring up an auth or data SDK.

**Prisma is included but idle.** `prisma/schema.prisma` (Postgres) and a client singleton at `src/lib/db.js` are wired up, but nothing imports the client yet — no database connection is opened until you start using it. Model your domain in the schema, run `npm run prisma:migrate`, then replace the array operations in `src/lib/server/posts.service.js` with queries.

Not a monorepo — the whole project is a single npm package rooted at the repo top level. Next.js App Router, Zustand, `motion`.

## Frontend architecture

- **Strict layering: API → store → hook → component.** `src/lib/api.js` is the only thing that fetches, stores are the only thing that calls it, and hooks are the only thing that touches a store. The `feed`, `post`, and `comments` stores are API-backed and paginated (`{ items, nextCursor }`, cursors opaque); `auth` and `app` still read `metadata.js` in-session.
- **The list and the open post are separate stores.** `feed` owns the paginated list; `post` owns the open post and every write to a post (likes, comment tallies), applying each one to both its own copy and the feed's row through `patchPost` — otherwise a heart filled in the overlay empties again when it's dismissed. `comments` → `post` → `feed` is the dependency direction; keep it that way.
- **Post detail is fetched at runtime, by id.** Opening a post promotes the feed's cached row synchronously — so the photo the reader just tapped paints on the first frame with no skeleton — then refreshes it from `/api/posts/:id` silently in the background. That's what lets post ids be unknown at build time, which the static export requires.
- **Simulated latency lives on the server** (`MOCK_LATENCY_MS`, inside the mock services), because that's where a real backend's latency would be. Stores must not add a `mockDelay` floor of their own.
- **Auth is a lightweight mock.** Any credentials sign you in — the whole gate is `loggedIn = true` in `src/lib/store/auth/store.js`, persisted to `localStorage`. Route protection is client-side, via `<ProtectedGate>` / `<PublicGate>` in `src/components/AuthGate.jsx`, because a static export has no server to run middleware on. See `.claude/skills/develop/auth-architecture.md`.
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
npm run prisma:migrate   # create/apply a dev migration (needs DATABASE_URL)
npm run prisma:studio    # open Prisma Studio
```

## Deploying

**Web** deploys as a Node server: `npm run build` then `npm run start` (`next start`). This is the target that serves `/api`, and it's also what makes `/p/:id` deep links work. No env vars required; set `NEXT_PUBLIC_BASE_PATH` only if serving under a subpath, and `DATABASE_URL` only once you start using Prisma.

**Native** ships from the static export: `npm run ios` / `npm run android` builds `out/`, syncs it into the native project, and opens the platform IDE to archive from there. Re-run `npm run sync` after any web change — the native projects hold a copy of `out/`, not a live reference. The export contains no API, so a native build needs `NEXT_PUBLIC_API_BASE_URL` pointing at a deployed instance.

> `build:native` overwrites `.next` with the export, so `npm run start` afterwards serves a build with no `/api`. Re-run `npm run build` before `npm run start` if you've built native in between.
