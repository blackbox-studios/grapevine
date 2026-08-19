---
name: develop
description: Core project rules, technology stack, coding guidelines, and architectural constraints for building the application.
---

# Project Rules

This is **Synaxis** (synaxis.chat): a **Next.js 15 (App Router) + React 19** app for Orthodox parishes and dioceses. Posts, comments, likes, and the viewer come over HTTP from a real `/api` backed by **Postgres on Supabase** through **Prisma**. The dashboard surface in the `app` store is the last thing without an endpoint.

**It is invite-only and organization-scoped.** People belong to groups (a parish, a diocese) through a `Membership`, and a viewer's feed is the union of the groups they hold an **APPROVED** membership in — there is no unscoped read anywhere. Sign-in is an emailed one-time code with `shouldCreateUser: false`, so an address with no account can never be sent a code; provisioning is the only way in.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) + React 19 |
| State | Zustand (with immer + persist) |
| Routing | Next.js App Router (`src/app/**`) + `next/navigation` |
| Forms | react-hook-form + zod |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Auth | Supabase Auth (emailed one-time code, browser client) |
| Database | Postgres on Supabase via Prisma (`prisma/schema.prisma`, `src/lib/db.js`) |

---

## Frontend

**Everything but the dashboard is over the wire.** The `feed`, `post`, `comments`, `auth`, and `members` stores fetch from `/api` through `src/lib/api.js`, paginated, with optimistic writes. Only the `app` store is still in-session. All of them use the same store → hook → component layering, so moving a domain onto an endpoint is a store-level change.

**Critical rules:**
1. Read `frontend-architecture.md` before any frontend feature work, and `backend-architecture.md` before adding or changing an endpoint.
2. When adding a new store, follow `src/lib/store/feed/` (a paginated list), `src/lib/store/post/` (one item fetched by id, and the owner of writes to it), or `src/lib/store/members/` (a small unpaginated collection) — never fetch outside a store, and never touch a store outside its hook.
3. Mutations that affect multiple entities should do their cross-store writes directly via `useOtherStore.getState()`.

**Auth:** Supabase Auth, emailed one-time code, browser client only. The code length is a dashboard setting (8 here, not the widely-documented 6) — `OTP_LENGTH` in `lib/constants.js`, and the login form validates a range so changing it cannot lock everyone out. Two facts are kept apart — Supabase owns the *session*, `GET /api/me` owns the *viewer* (profile, vocation, role, groups). Route protection is the client gates in `src/components/AuthGate.jsx` and role gating is `<Privileged>` in `src/components/Auth.jsx` — **both are presentation**; real enforcement is `requireViewer` / `requireMembership` in `src/lib/server/auth.js`, because the API is reachable with curl. Not middleware, which a static export drops. Read `auth-architecture.md` before touching any of it.

**Two authorization axes, deliberately not merged.** `Membership.role` (ADMIN | MEMBER) is per-group permission — only an admin may publish. `Profile.vocation` (PRIEST | FAITHFUL) is who someone is and grants nothing. A priest is usually their parish's admin but need not be.

**API:** route handlers live at `src/app/api/**/route.api.js` — the `.api.js` extension is load-bearing, not stylistic: it is what keeps the API tree out of the static export, which cannot host route handlers at all. The wire contract (success shapes, the single error shape, the error-code registry, keyset cursor pagination) is `backend-architecture.md`. Read it before adding an endpoint.

**Native:** the same app ships to iOS/Android via Capacitor, from a static export (`npm run build:native`). That target is what forbids middleware, intercepting routes, and route handlers, and it requires `generateStaticParams` on every dynamic segment — which is why post detail is fetched by id at runtime instead of being a route. Read `native-architecture.md` before touching `next.config.mjs`, the root layout, or anything under `android/` / `ios/`.

**Before adding any auth or data SDK:** read the "Adding a library" section of `native-architecture.md`. Vendor Next.js guides assume a Node server and will tell you to add `src/middleware.js` — which `output: "export"` drops silently, shipping the app with no auth gate and no error to warn you. Server Actions, `cookies()`/`headers()`, and native reliance on `src/app/api/**` are out for the same reason.

**Database (Prisma):** Postgres on Supabase. The domain is `prisma/schema.prisma` — read its header first, it explains the two decisions that carry the design. Two connection URLs are required, not optional: `DATABASE_URL` (pooler, 6543) for the app and `DIRECT_URL` (5432) for migrations, because Prisma Migrate's advisory locks and DDL do not survive a transaction pooler. Pagination is keyset, not offset, and identifiers are snake_case in Postgres via `@@map`. `npm run prisma:migrate` → `npm run db:secure` → `npm run prisma:seed`; `npm run db:reset` does all three. **`db:secure` is not optional and must follow every migration**: it applies `prisma/policies.sql`, which enables RLS and revokes the Data API's grants — without it, Supabase's auto-generated REST API serves every table to anyone holding the publishable key from our own client bundle. See `backend-architecture.md` → **The database**.

**Guides:**
- `frontend-architecture.md` — Architecture, patterns, UI components.
- `backend-architecture.md` — the API contract, the server layer, and how to add an endpoint.
- `auth-architecture.md` — Supabase OTP sign-in, the two identities, and where authorization is actually enforced.
- `native-architecture.md` — the Capacitor build, the dual build targets, and the static-export constraints.

---

## General guidelines

- **No emojis in code or docs** unless the user asks for them.

### Comments

Comments carry the *why*; the code already states the what. Five rules, and the first two are the ones that get broken:

- **Document the decision, not the journey.** When a change reverses an earlier one, **replace** the comment that explained the old approach — never append the new reasoning underneath it. A block that records every direction the code was taken in is unreadable, and a reader cannot tell which paragraph is still true. Only the final decision belongs in the file; the history belongs in git.
- **Never comment on where code *isn't*.** "This lives in X, not here", "moved to Y", "deliberately not in this file" — that is the journey wearing a signpost, and it is a pointer that goes stale the moment the other file moves again. State what the code in front of you does and why. The corollary: **if an edit leaves a file's code unchanged, its comments come out unchanged too.** Touching only the prose of a file you didn't otherwise modify is the tell that you are narrating a decision rather than documenting one.
- **Length is earned.** One or two lines is the default. Spend a paragraph only where the next person would otherwise undo the decision — a platform quirk, an ordering that looks arbitrary and isn't, a constraint enforced somewhere else. Never on restating a signature.
- **Say it once.** If the header of a function or file already establishes a constraint, a line inside it refers to that constraint rather than re-arguing it.
- **Delete what the code outgrew, in the same edit.** A stale comment is worse than no comment, because it is trusted.
