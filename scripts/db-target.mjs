/* Which database the CLI is about to act on, and whether that is allowed.
 *
 * Imported by the seeds and by `npm run db:reset`. It exists because the two most
 * destructive commands in this project read their target from an environment variable,
 * and an environment variable is a thing you forget you exported.
 *
 * ── The failure this prevents ────────────────────────────────────────────────
 *
 * `db:reset` drops every table. The dev seed deletes and rewrites the fixture posts and
 * writes fourteen invented parishioners. Both are correct against a laptop's container
 * and catastrophic against the parish's live database, and the only thing distinguishing
 * the two is a URL in a file that is not in version control. A shell that still has a
 * production DATABASE_URL exported from an earlier task is all it takes.
 *
 * So the destructive paths refuse to run unless the host is local, and the refusal names
 * the host it found. `SEED_ALLOW_REMOTE=1` is the override, deliberately ugly and
 * deliberately not in any npm script: it has to be typed, at the moment, by someone who
 * has read the message.
 *
 * This is a guard rail, not a security boundary. Anyone who can set DATABASE_URL can set
 * SEED_ALLOW_REMOTE. It is here to stop an accident, which is the thing that actually
 * happens.
 */

/* Hosts that cannot be anyone's production database.
 *
 * `host.docker.internal` is on the list because a process inside a container reaches the
 * host's Postgres by that name — it is still the laptop's container, just addressed from
 * the other side. */
const LOCAL_HOSTS = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "host.docker.internal",
])

/* The host a connection string points at, or null if it cannot be read.
 *
 * Unparseable is treated as *remote* by every caller below. A malformed URL is not
 * evidence of safety, and defaulting the other way would turn a typo into permission. */
export const databaseHost = (url = process.env.DATABASE_URL) => {
    if (!url) return null
    try {
        return new URL(url).hostname.toLowerCase()
    } catch {
        return null
    }
}

export const isLocalDatabase = (url = process.env.DATABASE_URL) => {
    const host = databaseHost(url)
    return host !== null && LOCAL_HOSTS.has(host)
}

/* A short description of the target, for the banner every seed prints before it writes.
 *
 * Naming the host up front is half the protection: most near-misses are caught by a human
 * reading "→ database: db.svyqhmbtdiqgtdttwgem.supabase.co" and pressing Ctrl-C. */
export const describeDatabase = (url = process.env.DATABASE_URL) => {
    const host = databaseHost(url)
    if (!host) return "unknown (DATABASE_URL is unset or unparseable)"
    return `${host}${isLocalDatabase(url) ? " (local)" : " (REMOTE)"}`
}

/**
 * Exits unless the target is local.
 *
 * `action` names what was about to happen, so the message is about the consequence rather
 * than about the check — "this would rewrite the fixture corpus" is what makes someone
 * stop, not "assertion failed".
 */
export const requireLocalDatabase = (action) => {
    if (isLocalDatabase()) return

    if (process.env.SEED_ALLOW_REMOTE === "1") {
        console.warn(
            `! SEED_ALLOW_REMOTE=1 — running "${action}" against ${describeDatabase()} anyway.\n`,
        )
        return
    }

    console.error(
        `\n✗ Refusing to run "${action}" against ${describeDatabase()}.\n\n` +
            "  This command is destructive and is meant for the local container:\n\n" +
            "      npm run db:up\n\n" +
            "  Check DATABASE_URL in .env.local. If you genuinely mean to do this to a\n" +
            "  remote database, re-run with SEED_ALLOW_REMOTE=1 prefixed.\n",
    )
    process.exit(1)
}
