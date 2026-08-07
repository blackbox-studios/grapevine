# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ozora web app**: a **Next.js 15 (App Router) on React 19** app for cannabis cultivators to interact with Metrc (the seed-to-sale compliance system). Today it runs on in-session mock data (apps, cultivator locations/nodes, deployments, events) so the flows are clickable before a real Metrc-backed API is wired in.

**No real backend yet, but there is a Node server.** The app is client-rendered (pages/layouts are Client Components); Next exists here for the Node server it provides — a real API will land as Next **route handlers** under `src/app/api/**/route.js`. Until then every store is seeded from `src/lib/metadata.js` and mutates its own in-memory copy in-session — no database required.

Not a monorepo — the whole project is a single npm package rooted at the repo top level. Next.js App Router, Zustand, `motion`.

## Frontend architecture

- **Stores** (`src/lib/store/`) each expose an `init()` that reads seed data from `metadata.js` after a `mockDelay()` — so loading skeletons still fire. Mutations (`deploy`, `create`, `logout`, etc.) update in-memory state and, where relevant, cross-store state (e.g. deploy adds an event + updates a node row).
- **Mock API surface** lives in `src/lib/mock.js` (`mockDelay`, `mockId`) — swap these for real `fetch` calls when you point the frontend at a live backend.
- **Auth** is real **Auth0** (`@auth0/nextjs-auth0` v4), served through the custom domain `auth.ozora.com`. `src/middleware.js` mounts the SDK's `/auth/*` routes and gates the app on the Auth0 session; `src/lib/store/auth/` mirrors the profile into Zustand so the UI reads `user`/`loggedIn` as before. **Before any auth work, read `.claude/skills/develop/ozora-auth-architecture.md`** — it covers the tenant/custom-domain setup, the end-to-end flow, hard-won gotchas (cookie-path login loop; `/auth/*` must use `window.location.assign`, not `router.push`), free-tier constraints, and the roadmap (notably: production currently shares the dev/trial tenant and should move to a dedicated prod tenant).

Full patterns and conventions: `.claude/skills/develop/frontend-architecture.md`.

## Development Commands

```bash
npm install              # install deps
npm run dev              # Next dev server at :3000
npm run build            # production build → .next/
npm run start            # serve the production build
npm run lint             # eslint (max-warnings 0)
```

## Deploying

Deploys to **AWS** as a Node server: `npm run build` then `npm run start` (`next start`). No env vars required for the mock app; set `NEXT_PUBLIC_BASE_PATH` only if serving under a subpath.
