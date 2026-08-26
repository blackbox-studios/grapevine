/* Provisioning primitives shared by the dev and prod seeds.
 *
 * The two seeds differ in *what* they write and in how hard they overwrite (see the header
 * of each). What they cannot differ on is how a person comes into existence: an auth user
 * in Supabase, a Profile whose id mirrors it, and a Membership that grants access. Getting
 * that wrong in one of two copies is how a database ends up with a Profile whose id matches
 * no `auth.users` row — a person who is in every roster and can never sign in.
 */

import { PrismaClient } from "@prisma/client"
import { createClient } from "@supabase/supabase-js"

export const prisma = new PrismaClient()

/* The admin client, or a refusal that says which variable is missing.
 *
 * Creating auth users is an admin operation, so this needs the secret key — the one that
 * bypasses every RLS policy. It lives in .env.local and must never reach the client bundle,
 * which is why provisioning is a local script and not a route. */
export const supabaseAdmin = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
        throw new Error(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Both are required to " +
                "provision sign-in accounts. See .env.example.",
        )
    }

    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/* Profiles with no auth user still need a primary key. A synthetic uuid is fine — nothing
 * will ever present a token for them — but it must be stable across runs, or every re-seed
 * orphans the previous run's posts and comments. Derived from the handle so it is. */
export const syntheticId = (handle) => {
    /* UUIDv5-shaped without pulling in a dependency: hash the handle to 32 hex digits and
     * stamp the version/variant nibbles so Postgres accepts it as a uuid. */
    let h1 = 0x811c9dc5
    let h2 = 0x01000193
    for (let i = 0; i < handle.length; i++) {
        h1 = Math.imul(h1 ^ handle.charCodeAt(i), 0x01000193) >>> 0
        h2 = Math.imul(h2 + handle.charCodeAt(i), 0x85ebca6b) >>> 0
    }
    const hex = (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(2)
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        `5${hex.slice(13, 16)}`,
        `8${hex.slice(17, 20)}`,
        hex.slice(20, 32),
    ].join("-")
}

/* The Admin API has no get-by-email, so page through until the address turns up. Fine at
 * seed scale; if the project ever holds thousands of users, store the id instead. */
export const findAuthUserByEmail = async (supabase, email) => {
    for (let page = 1; page <= 10; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
        if (error) throw error
        const match = data.users.find(
            (user) => user.email?.toLowerCase() === email.toLowerCase(),
        )
        if (match) return match
        if (data.users.length < 200) return null
    }
    return null
}

/**
 * Creates (or finds) the Supabase auth user for a sign-innable person, and returns its id.
 *
 * `email_confirm: true` matters: an unconfirmed address cannot be sent an OTP, so without it
 * the seeded accounts would exist and still be unable to sign in.
 *
 * **Finding an existing user is the normal path, not the error path.** Auth lives in the
 * hosted project even when the database is the local container, so a laptop re-seed almost
 * always resolves to a user that already exists — and it must reuse that id, or the local
 * Profile would key to a uuid the real token never carries and every request would 401 with
 * a valid session.
 */
export const provisionAuthUser = async (supabase, person) => {
    const { data: created, error } = await supabase.auth.admin.createUser({
        email: person.email,
        email_confirm: true,
        user_metadata: {
            full_name: [person.firstName, person.lastName].filter(Boolean).join(" "),
            handle: person.handle,
        },
    })

    if (!error) return created.user.id

    const existing = await findAuthUserByEmail(supabase, person.email)
    if (existing) return existing.id

    throw new Error(`Could not provision ${person.email}: ${error.message}`)
}

/* A provisional handle from an email local part.
 *
 * Mirrors `deriveHandle` in profile.service.js, which is what admission through the app
 * uses — an admin adding somebody knows only their address. **It is a placeholder**: first-run
 * orientation asks the person to choose one and overwrites it, which is exactly why the prod
 * seed never rewrites a handle it did not create. */
export const handleFromEmail = (email) =>
    email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24) || "member"

/* One membership per person per group, and re-running only ever confirms it.
 *
 * `decidedAt` is stamped because a seeded grant is a decision somebody made, even if that
 * somebody was this file; leaving it null would make the roster's "added by" column lie by
 * omission. `decidedById` stays null — no profile admitted them. */
export const upsertMembership = (profileId, orgId, { role, status = "APPROVED" }) =>
    prisma.membership.upsert({
        where: { profileId_orgId: { profileId, orgId } },
        update: { role, status },
        create: { profileId, orgId, role, status, decidedAt: new Date() },
    })
