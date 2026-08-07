---
name: develop
description: Core project rules, technology stack, coding guidelines, and architectural constraints for building the application.
---

# Project Rules

This is **Scrolls** (scrolls.chat): a **Next.js 15 (App Router) + React 19** app template that today runs 100% on in-session mock data. The seed entities in `src/lib/metadata.js` (users, events, dashboard cards) are placeholders — replace them with your real domain as the backend is wired up. It ships intentionally lightweight but structured to grow into a full product.

The template ships single-tenant — all authenticated users see all entities; there is no tenant boundary.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) + React 19 |
| State | Zustand (with immer + persist) |
| Routing | Next.js App Router (`src/app/**`) + `next/navigation` |
| Forms | react-hook-form + zod |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Database | Prisma (Postgres) — wired but idle (`prisma/schema.prisma`, `src/lib/db.js`) |

---

## Frontend

**The app has no live backend yet.** Every store reads seed data from `src/lib/metadata.js` and mutates its own in-memory copy in-session. `src/lib/mock.js` provides `mockDelay` and `mockId` helpers that stand in for a networked API layer.

**Critical rules:**
1. Read `frontend-architecture.md` before any frontend feature work.
2. When adding a new store, follow the pattern in `src/lib/store/app/` (store + hook + seed from `metadata.js` via `mockDelay`).
3. Mutations that affect multiple entities should do their cross-store writes directly via `useOtherStore.getState()`.

**Auth:** the app uses a lightweight mock login (any credentials → `loggedIn = true`, plus a `scrolls-auth` cookie for the server-side middleware gate). Read `auth-architecture.md` before touching `src/middleware.js` or `src/lib/store/auth/`.

**Database (Prisma):** Prisma is installed and configured against Postgres, but **nothing imports the client (`src/lib/db.js`) yet** — no connection is opened until you use it. To persist real data: model your domain in `prisma/schema.prisma`, set `DATABASE_URL`, run `npm run prisma:migrate`, then `import { prisma } from "@/lib/db"` from a route handler under `src/app/api/**/route.js`. Keep the API layered (route handler → store → hook → component), same as the mock data path.

**Guides:**
- `frontend-architecture.md` — Architecture, patterns, UI components.
- `auth-architecture.md` — how the mock auth works and how to replace it with a real provider.

---

## General guidelines

- **No emojis in code or docs** unless the user asks for them.
