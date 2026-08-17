/* Applies prisma/policies.sql — the RLS + grant lockdown that keeps this schema out of
 * reach of Supabase's Data API. Read that file's header for why it is not optional.
 *
 *   npm run db:secure
 *
 * Always over the DIRECT connection (port 5432), never the pooler: this issues DDL and
 * creates an event trigger, and the transaction pooler is the wrong transport for both.
 *
 * Prefers `psql` because it is the tool the file is written for — dollar-quoted function
 * bodies and `do $$ ... $$` blocks are exactly what a real client parses correctly — and
 * falls back to `prisma db execute`, which is bundled, so this works with no extra
 * install. That fallback sends the file as a single command, which Postgres is happy with.
 *
 * The fallback passes `--url`, which the Prisma 6 CLI accepts. Newer CLI documentation
 * describes `db execute` as taking its datasource from `prisma.config.ts` instead, so if
 * that flag is ever dropped this branch needs `--schema prisma/schema.prisma` and a
 * config whose datasource points at the direct connection. `psql` is unaffected. */

import "dotenv/config"

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const FILE = "prisma/policies.sql"

const url = process.env.DIRECT_URL || process.env.DATABASE_URL

if (!url) {
    console.error(
        "✗ Neither DIRECT_URL nor DATABASE_URL is set. Add them to .env.local — see .env.example.",
    )
    process.exit(1)
}

if (!existsSync(FILE)) {
    console.error(`✗ ${FILE} not found.`)
    process.exit(1)
}

if (!process.env.DIRECT_URL) {
    console.warn(
        "! DIRECT_URL is not set; falling back to DATABASE_URL. If that is the pooled\n" +
            "  connection (port 6543), the event trigger may fail — set DIRECT_URL.",
    )
}

const hasPsql = spawnSync("psql", ["--version"], { stdio: "ignore" }).status === 0

const [command, args] = hasPsql
    ? ["psql", [url, "--quiet", "-v", "ON_ERROR_STOP=1", "-f", FILE]]
    : ["npx", ["prisma", "db", "execute", "--file", FILE, "--url", url]]

console.log(`→ Applying ${FILE} via ${command}`)

const result = spawnSync(command, args, { stdio: "inherit" })

if (result.status !== 0) {
    console.error(
        `\n✗ Failed to apply ${FILE}.\n` +
            "  The database is NOT locked down against the Data API. Do not deploy until this\n" +
            "  succeeds — see the header of prisma/policies.sql.",
    )
    process.exit(result.status ?? 1)
}

console.log("✓ RLS enabled and Data API grants revoked on every table in public.")
