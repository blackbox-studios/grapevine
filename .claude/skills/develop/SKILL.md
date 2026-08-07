---
name: develop
description: Core project rules, technology stack, coding guidelines, and architectural constraints for building the application.
---

# Project Rules

This is the **Ozora web app**: a React 19 + Vite SPA that today runs 100% on in-session mock data (Vercel-ready). Ozora helps cannabis cultivators interact with Metrc (the seed-to-sale compliance system). The seed entities in `src/lib/metadata.js` — cultivator locations (nodes), the apps deployed to them, users, and events — are placeholders that will be replaced with real Metrc-backed data as the backend is wired up.

The template ships single-tenant — all authenticated users see all entities; there is no tenant boundary.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 + Vite |
| State | Zustand (with immer + persist) |
| Router | React Router 7 |
| Forms | react-hook-form + zod |
| Styling | Tailwind CSS 4 + shadcn/ui |

---

## Frontend

**The app has no backend.** Every store reads seed data from `src/lib/metadata.js` and mutates its own in-memory copy in-session. `src/lib/mock.js` provides `mockDelay` and `mockId` helpers that stand in for a networked API layer.

**Critical rules:**
1. Read `frontend-architecture.md` before any frontend feature work.
2. When adding a new store, follow the pattern in `src/lib/store/apps/` (store + hook + seed from `metadata.js` via `mockDelay`).
3. Mutations that affect multiple entities (deploy → adds event, updates node) should do their cross-store writes directly via `useOtherStore.getState()`.

**Guides:**
- `frontend-architecture.md` — Architecture, patterns, UI components. Note: some historical sections reference the deleted `/apps/:app/:version` page and the removed `Privileged`/role gating — treat those as archived context.

---

## General guidelines

- **No emojis in code or docs** unless the user asks for them.
