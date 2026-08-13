---
name: develop
description: Core project rules, technology stack, coding guidelines, and architectural constraints for building the application.
---

# Project Rules

This is **Synaxis** (synaxis.chat): a **Next.js 15 (App Router) + React 19** app template. Posts and comments come over HTTP from a real `/api` (route handlers backed by mock data, not a database yet); the remaining entities in `src/lib/metadata.js` (users, events, dashboard cards) are still client-side seed awaiting an endpoint. It ships intentionally lightweight but structured to grow into a full product.

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

**Half the app is over the wire, half is not yet.** The `feed`, `post`, and `comments` stores fetch from `/api` through `src/lib/api.js`, paginated, with optimistic writes. The `auth` and `app` stores still read `src/lib/metadata.js` in-session. Both paths use the same store → hook → component layering, so moving a domain onto an endpoint is a store-level change.

**Critical rules:**
1. Read `frontend-architecture.md` before any frontend feature work, and `backend-architecture.md` before adding or changing an endpoint.
2. When adding a new store, follow `src/lib/store/feed/` (a paginated list), `src/lib/store/post/` (one item fetched by id, and the owner of writes to it), or `src/lib/store/app/` (in-session seed) — never fetch outside a store, and never touch a store outside its hook.
3. Mutations that affect multiple entities should do their cross-store writes directly via `useOtherStore.getState()`.

**Auth:** the app uses a lightweight mock login (any credentials → `loggedIn = true`, persisted to `localStorage`). Route protection is the client gates in `src/components/AuthGate.jsx` — not middleware, which a static export drops. Read `auth-architecture.md` before touching them or `src/lib/store/auth/`.

**API:** route handlers live at `src/app/api/**/route.api.js` — the `.api.js` extension is load-bearing, not stylistic: it is what keeps the API tree out of the static export, which cannot host route handlers at all. The wire contract (success shapes, the single error shape, the error-code registry, cursor pagination, where the mocked latency lives) is `backend-architecture.md`. Read it before adding an endpoint.

**Native:** the same app ships to iOS/Android via Capacitor, from a static export (`npm run build:native`). That target is what forbids middleware, intercepting routes, and route handlers, and it requires `generateStaticParams` on every dynamic segment — which is why post detail is fetched by id at runtime instead of being a route. Read `native-architecture.md` before touching `next.config.mjs`, the root layout, or anything under `android/` / `ios/`.

**Before adding any auth or data SDK:** read the "Adding a library" section of `native-architecture.md`. Vendor Next.js guides assume a Node server and will tell you to add `src/middleware.js` — which `output: "export"` drops silently, shipping the app with no auth gate and no error to warn you. Server Actions, `cookies()`/`headers()`, and native reliance on `src/app/api/**` are out for the same reason.

**Database (Prisma):** Prisma is installed and configured against Postgres, but **nothing imports the client (`src/lib/db.js`) yet** — no connection is opened until you use it. To persist real data: model your domain in `prisma/schema.prisma`, set `DATABASE_URL`, run `npm run prisma:migrate`, then replace the array operations in `src/lib/server/posts.service.js` with queries. The services are the only seam that needs to change; see `backend-architecture.md` → **Wiring in a real database**.

**Guides:**
- `frontend-architecture.md` — Architecture, patterns, UI components.
- `backend-architecture.md` — the API contract, the server layer, and how to add an endpoint.
- `auth-architecture.md` — how the mock auth works and how to replace it with a real provider.
- `native-architecture.md` — the Capacitor build, the dual build targets, and the static-export constraints.

---

## General guidelines

- **No emojis in code or docs** unless the user asks for them.
