/* Seed entry point — chooses between the development and production seeds.
 *
 *   npm run db:seed          development: two groups, fixture corpus, disposable
 *   npm run db:seed:prod     production:  one group, two admins, no posts
 *
 * This file picks; it never writes. The two seeds beside it are separate files rather than
 * one file behind a flag because they differ in the thing that matters most — the dev seed
 * deletes and rewrites rows it owns, and the prod seed contains no delete at all. A shared
 * implementation is exactly where a `deleteMany` guarded by the wrong condition would end
 * up, so there is no shared implementation. Only `seed-lib.js`, which provisions a person
 * the one correct way, is common to both.
 *
 * ── Why the default is development ───────────────────────────────────────────
 *
 * `prisma db seed` — which the Prisma CLI runs, and which `db:reset` chains — takes no
 * arguments this file can read. Something has to be the default, and it must be the one
 * whose accidental invocation is survivable. That is the dev seed, and only because it
 * additionally refuses to run against a remote database (`scripts/db-target.mjs`): the two
 * defences together mean a bare `prisma db seed` typed against production writes nothing
 * and exits non-zero.
 *
 * Production is therefore opt-in, by an environment variable that has to be typed:
 *
 *     SEED_TARGET=prod node prisma/seed.js
 */

const TARGET = (process.env.SEED_TARGET || "dev").toLowerCase()

const SEEDS = {
    dev: "./seed.dev.js",
    development: "./seed.dev.js",
    prod: "./seed.prod.js",
    production: "./seed.prod.js",
}

const entry = SEEDS[TARGET]

if (!entry) {
    console.error(
        `\n✗ Unknown SEED_TARGET "${process.env.SEED_TARGET}".\n\n` +
            "  Valid values are `dev` (the default) and `prod`.\n",
    )
    process.exit(1)
}

/* Imported dynamically so only the chosen seed is ever evaluated. Both open a Prisma client
 * and one of them builds a Supabase admin client at module scope; loading the pair would
 * connect twice and leave a handle open that nothing disconnects. */
await import(entry)
