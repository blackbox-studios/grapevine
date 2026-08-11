# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Synaxis** (synaxis.chat) is a **Next.js 15 (App Router) on React 19** app template. It ships as a clickable front end running entirely on in-session mock data (users, dashboard cards, connections, events) so the flows work before a real backend is wired in. It is intentionally lightweight, but structured so you can build a full product on top of it.

**No real backend yet, but Next.js provides the Node server.** The app is client-rendered (pages/layouts are Client Components); a real API will land as Next **route handlers** under `src/app/api/**/route.js`. Until then every store is seeded from `src/lib/metadata.js` and mutates its own in-memory copy in-session.

**Prisma is included but idle.** `prisma/schema.prisma` (Postgres) and a client singleton at `src/lib/db.js` are wired up, but nothing imports the client yet — no database connection is opened until you start using it. Model your domain in the schema and run `npm run prisma:migrate` when you're ready to persist real data.

Not a monorepo — the whole project is a single npm package rooted at the repo top level. Next.js App Router, Zustand, `motion`.

## Frontend architecture

- **Stores** (`src/lib/store/`) each expose an `init()` that reads seed data from `metadata.js` after a `mockDelay()` — so loading skeletons still fire. Mutations update in-memory state and, where relevant, cross-store state.
- **Mock API surface** lives in `src/lib/mock.js` (`mockDelay`, `mockId`) — swap these for real `fetch` calls (or Prisma-backed route handlers) when you point the frontend at a live backend.
- **Auth is a lightweight mock.** Any credentials sign you in — the whole gate is `loggedIn = true` in `src/lib/store/auth/store.js`, which also writes a `synaxis-auth` cookie so `src/middleware.js` can gate protected/public routes server-side. When you add a real provider, replace the cookie write with an HTTP-only session cookie set by the server and the middleware keeps working unchanged. See `.claude/skills/develop/auth-architecture.md`.

Full patterns and conventions: `.claude/skills/develop/frontend-architecture.md`.

## Development Commands

```bash
npm install              # install deps (runs `prisma generate`)
npm run dev              # Next dev server at :3000
npm run build            # production build → .next/
npm run start            # serve the production build
npm run lint             # eslint (max-warnings 0)

npm run prisma:generate  # regenerate the Prisma client from the schema
npm run prisma:migrate   # create/apply a dev migration (needs DATABASE_URL)
npm run prisma:studio    # open Prisma Studio
```

## Deploying

Deploys as a Node server: `npm run build` then `npm run start` (`next start`). No env vars required for the mock app; set `NEXT_PUBLIC_BASE_PATH` only if serving under a subpath, and `DATABASE_URL` only once you start using Prisma.
