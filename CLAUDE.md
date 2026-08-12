# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Synaxis** (synaxis.chat) is a **Next.js 15 (App Router) on React 19** app template that also ships as a native iOS/Android app via **Capacitor**. It runs as a clickable front end on in-session mock data (users, dashboard cards, connections, events) so the flows work before a real backend is wired in. It is intentionally lightweight, but structured so you can build a full product on top of it.

**No real backend yet, but Next.js provides the Node server.** The app is client-rendered (pages/layouts are Client Components); a real API will land as Next **route handlers** under `src/app/api/**/route.js`. Until then every store is seeded from `src/lib/metadata.js` and mutates its own in-memory copy in-session.

**Two build targets, one codebase.** `npm run build` produces the Node server build (keeps route handlers, so it's the target for a real `/api`). `npm run build:native` produces a **static export** in `out/` that Capacitor packages. The static target is the constraining one: it forbids middleware and intercepting routes, and every dynamic segment needs `generateStaticParams`. See `.claude/skills/develop/native-architecture.md`.

> **Do not add `src/middleware.js`.** Vendor quickstarts (Supabase, NextAuth, Clerk) all tell you to, and it is the single most damaging thing you can do here: `output: "export"` drops middleware **silently** — no build error, no runtime error, the app just ships with no auth gate. Route protection belongs in `src/components/AuthGate.jsx`. The same applies to Server Actions, `cookies()`/`headers()`, and any native code path that depends on `src/app/api/**`. Read the "Adding a library" section of `native-architecture.md` before wiring up an auth or data SDK.

**Prisma is included but idle.** `prisma/schema.prisma` (Postgres) and a client singleton at `src/lib/db.js` are wired up, but nothing imports the client yet — no database connection is opened until you start using it. Model your domain in the schema and run `npm run prisma:migrate` when you're ready to persist real data.

Not a monorepo — the whole project is a single npm package rooted at the repo top level. Next.js App Router, Zustand, `motion`.

## Frontend architecture

- **Stores** (`src/lib/store/`) each expose an `init()` that reads seed data from `metadata.js` after a `mockDelay()` — so loading skeletons still fire. Mutations update in-memory state and, where relevant, cross-store state.
- **Mock API surface** lives in `src/lib/mock.js` (`mockDelay`, `mockId`) — swap these for real `fetch` calls (or Prisma-backed route handlers) when you point the frontend at a live backend.
- **Auth is a lightweight mock.** Any credentials sign you in — the whole gate is `loggedIn = true` in `src/lib/store/auth/store.js`, persisted to `localStorage`. Route protection is client-side, via `<ProtectedGate>` / `<PublicGate>` in `src/components/AuthGate.jsx`, because a static export has no server to run middleware on. See `.claude/skills/develop/auth-architecture.md`.
- **Slide routes are shallow history.** Opening a post changes the URL with `history.pushState` so the feed behind it stays mounted; dismissing is `history.back()`, which is also why Android's back button works on it for free. See the Slide routes section of `frontend-architecture.md`.

Full patterns and conventions: `.claude/skills/develop/frontend-architecture.md`.

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

**Web** deploys as a Node server: `npm run build` then `npm run start` (`next start`). No env vars required for the mock app; set `NEXT_PUBLIC_BASE_PATH` only if serving under a subpath, and `DATABASE_URL` only once you start using Prisma.

**Native** ships from the static export: `npm run ios` / `npm run android` builds `out/`, syncs it into the native project, and opens the platform IDE to archive from there. Re-run `npm run sync` after any web change — the native projects hold a copy of `out/`, not a live reference.
