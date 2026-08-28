/* Lookups against Supabase's `auth.users` that the app and the seeds both need.
 *
 * Its own module because it straddles a boundary neither neighbour can cross. The app's copy
 * lives beside `supabaseAdmin()` in `server/supabase.js`, which is behind `server-only` and
 * throws the moment a plain Node process imports it; the seeds' copy lives in
 * `prisma/seed-lib.js`, which instantiates a `PrismaClient` at module scope and would hand
 * the app a second one per import. So the shared half sits here, holding neither — it takes
 * an admin client as an argument and reads no environment at all, which is also why it needs
 * no `server-only` guard of its own: there is nothing in it to leak.
 *
 * It was two copies, and the paging cap is exactly the kind of constant that drifts: raise it
 * in one and the other keeps quietly reporting a present address as absent.
 */

/* The Admin API pages at 200 and has no get-by-email, so a lookup is a scan. Ten pages is the
 * ceiling, past which an address that is genuinely present reads as absent — if a project
 * ever grows past 2000 users, store the id at admission rather than raising this. */
const PAGE_SIZE = 200
const MAX_PAGES = 10

/* The auth user for an address, or null.
 *
 * **Auth and the database can hold different sets of people, and the database is the one that
 * gets rebuilt.** A Supabase project is shared across every environment pointed at it —
 * `docker-compose.yml` isolates Postgres alone — so `db:reset` drops a Profile while the
 * `auth.users` row it mirrored survives. Both callers have to find that survivor and reuse
 * its id, or the address is permanently unaddable: too new for the Profile lookup, too old
 * for `createUser`.
 *
 * Because it scans, it belongs on the failure path of `createUser` rather than in front of
 * it — one wasted create is cheaper than paging every admission. */
export const findAuthUserByEmail = async (supabase, email) => {
    const wanted = String(email).toLowerCase()

    for (let page = 1; page <= MAX_PAGES; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({
            page,
            perPage: PAGE_SIZE,
        })
        if (error) throw error

        const match = data.users.find((user) => user.email?.toLowerCase() === wanted)
        if (match) return match
        if (data.users.length < PAGE_SIZE) return null
    }

    return null
}
