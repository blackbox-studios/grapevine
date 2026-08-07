# Ozora

Ozora is the platform that helps cannabis cultivators interact with [Metrc](https://www.metrc.com/) — the seed-to-sale compliance system that state regulators require operators to use. This repo is the Ozora web app: a React 19 + Vite SPA that runs 100% on in-session mock data today, so you can click around the flows (locations, apps, deployments, events) before a real Metrc-backed API is wired in.

Every Zustand store reads seed data from `src/lib/metadata.js` and mutates its own in-memory copy in-session. No backend, no database, no env vars required.

## Quick start

```bash
npm install
npm run dev              # http://localhost:5173
```

Login accepts any credentials. The app boots seeded with cultivation-facing apps, cultivator locations, and a handful of recent events. Deploy an app, register a location, and walk between apps and locations — everything reflects in real time until you reload.

## Build

```bash
npm run build            # emits dist/
npm run preview          # serve the production build locally
```

## Deploy to Vercel

Point Vercel at this repo root. Framework detection picks up Vite automatically; `vercel.json` pins the build command and SPA rewrite rule. No env vars required.

## Lint

```bash
npm run lint
```

## Stack

- React 19, Vite 8, Tailwind CSS 4
- React Router 7, Zustand (with immer + persist), react-hook-form, Zod
- UI: shadcn/Radix primitives under `src/components/ui/`
- React Compiler enabled via Babel (see [React Compiler docs](https://react.dev/learn/react-compiler))

## Layout

```
src/
  lib/
    metadata.js     seed data (users, apps, nodes, events)
    mock.js         mockDelay / mockId
    store/          zustand stores (auth, apps, nodes, events)
    hooks/          shared hooks
    providers/      Router, Theme, DeployDrawer, Scroll
  components/       reusable UI pieces + shadcn primitives (ui/)
  pages/            file-routed pages
public/             static assets served as-is
```

## Adapting the template

1. **Adjust seed data.** Edit `src/lib/metadata.js` to define your entities (cultivator locations, Metrc-facing apps, users, events). Store hooks derive the app-visible shape, so most changes only touch that one file.
2. **Swap the brand assets.** The Ozora logo/crest lives in `src/assets/svg/`. Replace those files to update the login artwork and sidebar mark.
3. **Wire a real backend.** Replace `src/lib/mock.js`'s `mockDelay` with a `fetch`-based API client (Metrc-backed or otherwise), and swap store actions from in-memory mutations to API calls. The Zustand stores' shape (`loading`, `error`, `ready`, `refresh()`) already matches a networked implementation.

## Documentation

- `CLAUDE.md` — canonical rules for AI assistants (auto-loaded by Claude Code).
- `.claude/skills/develop/frontend-architecture.md` — architecture, patterns, UI components.
