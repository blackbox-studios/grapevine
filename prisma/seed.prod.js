/* The production seed.
 *
 *     npm run db:seed:prod
 *
 * Brings the live database to the state the app launches in: **one group, two admins, and
 * nothing else**. Holy Trinity Cathedral, Fr. Alexander Koranda, and Robert Paul. No posts,
 * no invented parishioners, no fixture ids — the first post in production is one somebody
 * actually writes.
 *
 * ── It guarantees access, not content ────────────────────────────────────────
 *
 * This is the rule that makes it safe to re-run against a live database, and it is the one
 * real difference from the dev seed beyond the row count.
 *
 * **Access is asserted every time.** The two admins exist, are confirmed in Supabase, hold
 * APPROVED ADMIN memberships in the Cathedral. Re-running repairs those, which is the point:
 * if a membership is revoked by accident, this is the way back in that needs no working
 * sign-in to perform.
 *
 * **Content is written once and never overwritten.** Names, handles, vocations, the group's
 * name, its bio, its avatar — the seed supplies them when the row is created and then leaves
 * them alone forever. They belong to the people who own them the moment the app is live:
 * Fr. Alexander picks his handle at /welcome, an admin renames the group or changes its
 * picture from Settings → Groups. A seed that reasserted its own values on every run would
 * silently undo both, and the re-run that did it would be a routine one.
 *
 * So: to change a name in production, change it in the app. This file is not how.
 *
 * ── Idempotent, additive, and never destructive ──────────────────────────────
 *
 * There is no `deleteMany` anywhere in this file, and there must never be one. The dev seed
 * has several — it owns its fixture ids and replaces them wholesale — which is exactly why
 * the two are separate files rather than one file with a flag.
 *
 * Requires SUPABASE_SECRET_KEY: creating auth users is an admin operation.
 */

import "dotenv/config"

import { describeDatabase } from "../scripts/db-target.mjs"
import {
    handleFromEmail,
    prisma,
    provisionAuthUser,
    supabaseAdmin,
    upsertMembership,
} from "./seed-lib.js"

/* ── The group ───────────────────────────────────────────────────────────────
 *
 * `slug` is the natural key and the only field here that is not editable in the app, so it
 * is the only one this file can safely be authoritative about. Everything else is a
 * *creation* default — see the header. */
const ORG = {
    slug: "holy-trinity-cathedral",
    name: "Holy Trinity Cathedral",
    kind: "PARISH",
    bio: "Announcements, feasts, and parish life.",
}

/* ── The two accounts ─────────────────────────────────────────────────────────
 *
 * Both ADMIN, and deliberately so: the app has no platform-owner concept yet (see the
 * "Adding groups without editing this file" note in backend-architecture.md), so the only
 * way to grant someone the ability to publish and manage the roster is a per-group ADMIN
 * membership. Two of them means neither person is a single point of failure for a parish
 * that cannot otherwise be administered.
 *
 * `vocation` is who someone is, `role` is what they may do, and the two are independent —
 * Fr. Alexander is a PRIEST who administers the Cathedral; Robert is FAITHFUL and administers
 * it too. Collapsing those into one field is the mistake the schema's header exists to
 * prevent. */
const PEOPLE = [
    {
        email: "ajkoranda@gmail.com",
        firstName: "Alexander",
        lastName: "Koranda",
        vocation: "PRIEST",
        role: "ADMIN",
    },
    {
        email: "rob@blackboxstudios.com",
        firstName: "Robert",
        lastName: "Paul",
        vocation: "FAITHFUL",
        role: "ADMIN",
    },
]

/**
 * Creates the profile if it is absent; otherwise fills only what is still empty.
 *
 * The `existing` branch is the whole safety property of this file. It never assigns a value
 * over one that is already there — so a handle chosen at /welcome, a name corrected by its
 * owner, or a vocation changed after an ordination all survive every future run. What it
 * does repair is a *missing* value, which can only be there because orientation has not
 * happened yet.
 *
 * `email` is the exception and is always asserted, because it is not a display field: it is
 * the address the sign-in code goes to, and it must keep matching the Supabase user this
 * profile mirrors.
 */
const ensureProfile = async (supabase, person) => {
    const id = await provisionAuthUser(supabase, person)
    const existing = await prisma.profile.findUnique({ where: { id } })

    if (!existing) {
        const profile = await prisma.profile.create({
            data: {
                id,
                email: person.email,
                handle: handleFromEmail(person.email),
                firstName: person.firstName,
                lastName: person.lastName,
                vocation: person.vocation,
            },
        })
        return { profile, created: true }
    }

    /* Only the gaps. An empty string counts as a gap; `null` is what the column actually
     * holds before orientation, but a blank saved through a form is the same absence. */
    const fill = {}
    if (!existing.firstName) fill.firstName = person.firstName
    if (!existing.lastName) fill.lastName = person.lastName
    if (existing.email !== person.email) fill.email = person.email

    const profile = Object.keys(fill).length
        ? await prisma.profile.update({ where: { id }, data: fill })
        : existing

    return { profile, created: false, filled: Object.keys(fill) }
}

const main = async () => {
    console.log(`\n→ database: ${describeDatabase()}`)
    console.log("→ seed:     PRODUCTION (one group, two admins, no posts)\n")

    const supabase = supabaseAdmin()

    /* The group. `update: {}` is not an oversight — it is the "content is written once"
     * rule in one line. The upsert exists to create the row when it is absent and to be a
     * no-op when it is present, so a rename done in the app outlives every re-run. */
    const org = await prisma.organization.upsert({
        where: { slug: ORG.slug },
        update: {},
        create: ORG,
    })
    console.log(`  group    ${org.name} (@${org.slug})`)

    for (const person of PEOPLE) {
        const { profile, created, filled } = await ensureProfile(supabase, person)
        await upsertMembership(profile.id, org.id, { role: person.role, status: "APPROVED" })

        const note = created
            ? "created"
            : filled?.length
              ? `filled ${filled.join(", ")}`
              : "already present"
        console.log(`  admin    ${person.email.padEnd(26)} @${profile.handle.padEnd(14)} ${note}`)
    }

    /* Counted rather than assumed. If this prints anything other than the two admins, the
     * database is not in the state this file describes and somebody should know before the
     * parish does. */
    const [members, admins, posts, orgs] = await Promise.all([
        prisma.membership.count({ where: { orgId: org.id, status: "APPROVED" } }),
        prisma.membership.count({ where: { orgId: org.id, status: "APPROVED", role: "ADMIN" } }),
        prisma.post.count({ where: { orgId: org.id } }),
        prisma.organization.count(),
    ])

    console.log(`\n✓ ${org.name}: ${members} members, ${admins} admins, ${posts} posts`)
    console.log(`  ${orgs} group${orgs === 1 ? "" : "s"} in the database.`)

    if (orgs > 1) {
        console.warn(
            "\n! More than one group exists. That is expected only if the dev seed has been\n" +
                "  run against this database, or a second parish has been onboarded. Check\n" +
                "  before launching.",
        )
    }

    console.log("\n  Both admins sign in with the emailed code — no password to distribute.")
}

main()
    .catch((error) => {
        console.error("\n✗ Production seed failed:", error.message)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
