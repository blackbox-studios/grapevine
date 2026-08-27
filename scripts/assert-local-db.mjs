/* Refuses to continue unless DATABASE_URL points at a local database.
 *
 *     node scripts/assert-local-db.mjs "db:reset"
 *
 * Chained ahead of the destructive npm scripts, so the check runs *before* the command that
 * would do the damage rather than inside it. `prisma migrate reset --force` asks nothing and
 * drops everything; by the time it prints its first line the tables are already going.
 *
 * The logic lives in db-target.mjs, shared with the seeds. This is only the CLI wrapper —
 * `npm run` cannot call a function, so it needs a file to spawn.
 */

import "dotenv/config"

import { requireLocalDatabase } from "./db-target.mjs"

requireLocalDatabase(process.argv[2] || "this command")
