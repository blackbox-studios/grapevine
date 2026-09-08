import "server-only"

import { PrismaClient } from "@prisma/client"

/* Single shared PrismaClient for the whole process. Node caches module imports, so
 * importing this file anywhere yields the same instance; since each client owns a
 * connection pool, a second instance would open a duplicate pool. In development
 * Next's hot reload re-evaluates modules, so we stash the client on `globalThis` to
 * avoid spawning a new pool on every reload — the canonical Next.js + Prisma pattern.
 *
 * LIVE: the services in `src/lib/server/*.service.js` query through this, so the API needs
 * a reachable DATABASE_URL. Nothing outside `src/lib/server/**` may import it — the
 * `server-only` above makes a Client Component that tries fail the build rather than
 * bundle Prisma and a connection string into the client.
 *
 * DATABASE_URL points at Supabase's session pooler, which holds one of this database
 * user's allotted clients per Prisma connection — so this pool's ceiling is
 * `connection_limit` in the connection string rather than anything in this file, and
 * Prisma's default is above the allotment. See .env.example. Migrations use DIRECT_URL,
 * because Prisma Migrate's advisory locks and DDL don't survive a transaction pooler. */
const globalForPrisma = globalThis

export const prisma =
    globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma
}
