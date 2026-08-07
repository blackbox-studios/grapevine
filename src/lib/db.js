import { PrismaClient } from "@prisma/client"

/* Single shared PrismaClient for the whole process. Node caches module imports, so
 * importing this file anywhere yields the same instance; since each client owns a
 * connection pool, a second instance would open a duplicate pool. In development
 * Next's hot reload re-evaluates modules, so we stash the client on `globalThis` to
 * avoid spawning a new pool on every reload — the canonical Next.js + Prisma pattern.
 *
 * IDLE BY DEFAULT: nothing in the app imports this yet (the UI runs on the mock data
 * in `src/lib/metadata.js`). No connection is opened until you first run a query, so
 * you can build and run the app without a database. Point DATABASE_URL at a Postgres
 * instance and `import { prisma } from "@/lib/db"` from a route handler when you are
 * ready to persist real data. */
const globalForPrisma = globalThis

export const prisma =
    globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma
}
