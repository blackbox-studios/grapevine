import { PrismaClient } from "@prisma/client"

/* Single shared PrismaClient for the whole process. Node caches module imports, so
 * importing this file anywhere yields the same instance; since each client owns a
 * connection pool, a second instance would open a duplicate pool. In development
 * Next's hot reload re-evaluates modules, so we stash the client on `globalThis` to
 * avoid spawning a new pool on every reload — the canonical Next.js + Prisma pattern.
 *
 * LIVE: the services in `src/lib/server/*.service.js` query through this, so the API needs
 * a reachable DATABASE_URL. Nothing outside `src/lib/server/**` may import it — those files
 * are all behind `server-only`, which is what keeps the client bundle (and the native
 * static export, which has no server at all) from ever pulling Prisma in.
 *
 * DATABASE_URL points at Supabase's transaction pooler; migrations use DIRECT_URL instead,
 * because Prisma Migrate's advisory locks and DDL don't survive a pooler. See
 * prisma/schema.prisma. */
const globalForPrisma = globalThis

export const prisma =
    globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma
}
