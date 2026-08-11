# Synaxis

Synaxis ([synaxis.chat](https://synaxis.chat)) is a lightweight **Next.js 15 + React 19** app template. It runs 100% on in-session mock data today, so you can click around the flows (dashboard, connections, settings, users) before wiring in a real backend — then grow it into a full product.

Every Zustand store reads seed data from `src/lib/metadata.js` and mutates its own in-memory copy in-session. No backend required to run it. **Prisma** (Postgres) is included and wired but idle — turn it on when you need to persist real data.

## Quick start

```bash
npm install
npm run dev              # http://localhost:3000
```

Login accepts any credentials (the whole gate is `loggedIn = true`). The app boots seeded with a demo user, a few dashboard cards, and some recent activity — everything reflects in real time until you reload.

## Build

```bash
npm run build            # production build → .next/
npm run start            # serve the production build
```

## Lint

```bash
npm run lint
```

## Database (Prisma)

Prisma is installed and configured against Postgres but **nothing imports the client yet** — the app runs without a database. When you're ready:

1. Set `DATABASE_URL` in `.env.local` (see `.env.example`).
2. Model your domain in `prisma/schema.prisma` (an `ExampleNote` model is there to prove the wiring).
3. `npm run prisma:migrate` to create the tables, then `import { prisma } from "@/lib/db"` from a route handler under `src/app/api/**/route.js`.

## Stack

- Next.js 15 (App Router), React 19, Tailwind CSS 4
- Zustand (with immer + persist), react-hook-form, Zod
- UI: shadcn/Radix primitives under `src/components/ui/`
- Prisma (Postgres) — wired but idle
- Server-side auth gate via `src/middleware.js` (mock cookie today)

## Layout

```
src/
  middleware.js     server-side auth gate (reads the synaxis-auth cookie)
  app/              Next.js App Router — (public)/ and (protected)/ route groups
  lib/
    metadata.js     seed data (users, events)
    mock.js         mockDelay / mockId
    db.js           Prisma client singleton (idle until used)
    store/          zustand stores (auth, app, …)
    hooks/          shared hooks
    providers/      Theme, Tooltip, Scroll
  components/       reusable UI pieces + shadcn primitives (ui/)
prisma/
  schema.prisma     Postgres schema (ExampleNote placeholder)
public/             static assets served as-is
```

## Adapting the template

1. **Adjust seed data.** Edit `src/lib/metadata.js` to define your entities. Store hooks derive the app-visible shape, so most changes only touch that one file.
2. **Swap the brand assets.** The logo/crest lives in `src/assets/svg/`. Replace those files to update the login artwork and sidebar mark.
3. **Wire a real backend.** Replace `src/lib/mock.js`'s `mockDelay` with a `fetch`-based API client (or Prisma-backed route handlers), and swap store actions from in-memory mutations to real calls. The Zustand stores' shape (`loading`, `error`, `ready`, `refresh()`) already matches a networked implementation.
4. **Add real auth.** Replace the mock cookie in `src/lib/store/auth/store.js` with an HTTP-only session cookie set by your login endpoint; `src/middleware.js` keeps working unchanged.

## Documentation

- `CLAUDE.md` — canonical rules for AI assistants (auto-loaded by Claude Code).
- `.claude/skills/develop/frontend-architecture.md` — architecture, patterns, UI components.
- `.claude/skills/develop/auth-architecture.md` — how the lightweight mock auth works and how to replace it.
