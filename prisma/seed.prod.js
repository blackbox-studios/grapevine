/* The production seed.
 *
 *     npm run db:seed:prod
 *
 * Brings the live database to the state the app launches in: **one group, two admins, and
 * nothing else**. Holy Trinity Cathedral, Fr. Alexander Koranda, and Robert Paul. No posts,
 * no invented parishioners, no fixture ids — the first post in production is one somebody
 * actually writes.
 *
 * Those two are also the platform's bootstrap OWNERs, which is what lets every group after
 * this one be created from the app instead of from here. Onboarding a further parish is
 * `npm run owner -- <their email>`, not an edit to this file.
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
 * Both ADMIN of the Cathedral, and both platform OWNER. Those are different things and the
 * seed asserts them separately because they mean different things: ADMIN is per-group and
 * lets them publish into the Cathedral and manage its roster; OWNER is the subscriber's axis
 * and lets them create further groups and delete the ones they create. Two of each means
 * neither person is a single point of failure.
 *
 * **These two are the bootstrap owners, and this file is not how anyone else becomes one.**
 * A new parish priest who subscribes is granted OWNER with `npm run owner -- <email>`, which
 * provisions his account if he has none — no deploy, no edit here. This list stays at two.
 *
 * `vocation` is who someone is, `role` is what they may do inside a group, `platformRole` is
 * what they may do to the platform, and `owns` is which group is theirs. All four are
 * independent — Fr. Alexander is a PRIEST who administers the Cathedral and owns it; Robert is
 * FAITHFUL, administers it too, and can create groups of his own without being able to delete
 * this one. Collapsing any two of them into one field is the mistake the schema's header
 * exists to prevent. */
const PEOPLE = [
    {
        email: "ajkoranda@gmail.com",
        firstName: "Alexander",
        lastName: "Koranda",
        vocation: "PRIEST",
        role: "ADMIN",
        platformRole: "OWNER",
        /* Owns the Cathedral itself — `Organization.createdById`. Both people here are
         * platform OWNERs, which is the right to create groups; this is the narrower fact of
         * which group is *theirs*, and it is what decides who may delete it. It is a parish,
         * and it is his. */
        owns: true,
    },
    {
        email: "rob@blackboxstudios.com",
        firstName: "Robert",
        lastName: "Paul",
        vocation: "FAITHFUL",
        role: "ADMIN",
        platformRole: "OWNER",
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
 * **Two fields are exceptions and are asserted every run, because neither is display.**
 * `email` is the address the sign-in code goes to and must keep matching the Supabase user
 * this profile mirrors. `platformRole` is access of the same kind the memberships below are:
 * it is what lets these two create the next group, and repairing it without a working sign-in
 * is exactly what this file is for. Re-running therefore restores ownership if it was ever
 * cleared — which is the intended behaviour for the two bootstrap accounts and the reason
 * every other owner is granted by `npm run owner` instead of by being added here.
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
                platformRole: person.platformRole,
            },
        })
        return { profile, created: true }
    }

    /* Only the gaps, plus the two asserted fields above. An empty string counts as a gap;
     * `null` is what the column actually holds before orientation, but a blank saved through
     * a form is the same absence. */
    const fill = {}
    if (!existing.firstName) fill.firstName = person.firstName
    if (!existing.lastName) fill.lastName = person.lastName
    if (existing.email !== person.email) fill.email = person.email
    if (existing.platformRole !== person.platformRole) fill.platformRole = person.platformRole

    const profile = Object.keys(fill).length
        ? await prisma.profile.update({ where: { id }, data: fill })
        : existing

    return { profile, created: false, filled: Object.keys(fill) }
}

const main = async () => {
    console.log(`\n→ database: ${describeDatabase()}`)
    console.log("→ seed:     PRODUCTION (one group, two admins/owners, no posts)\n")

    const supabase = supabaseAdmin()

    /* People first, because the group needs an owner and an owner is a profile id. This pass
     * only resolves the profiles — the memberships cannot be written until the group exists,
     * so those happen below. */
    const people = []
    for (const person of PEOPLE) {
        people.push({ person, ...(await ensureProfile(supabase, person)) })
    }

    /* Who the parish belongs to: the priest whose parish it is, named by `owns` in PEOPLE —
     * not whoever happens to run this script, and not both admins. `Organization.createdById`
     * holds one id, and `canDeleteOrg` reads it as the subscription boundary; a parish with two
     * people able to delete it is not a boundary. Robert administers the Cathedral and can
     * publish, invite and rename; retiring it is Fr. Alexander's alone. */
    const ownerId = people.find(({ person }) => person.owns)?.profile.id

    /* The group. `update: {}` is not an oversight — it is the "content is written once" rule
     * in one line, so a rename done in the app outlives every re-run. */
    const org = await prisma.organization.upsert({
        where: { slug: ORG.slug },
        update: {},
        create: { ...ORG, createdById: ownerId },
    })

    /* Ownership is repaired, never reassigned. A row created before this column existed
     * carries a null creator and can be deleted by nobody, which is a parish nobody can
     * retire; filling that gap is the same kind of thing as asserting a membership. An
     * existing value is left strictly alone, so ownership handed over in the future is not
     * dragged back to this file's answer on the next run. */
    if (!org.createdById && ownerId) {
        await prisma.organization.update({
            where: { id: org.id },
            data: { createdById: ownerId },
        })
        org.createdById = ownerId
        console.log(`  repair   set owner on ${org.slug}`)
    }

    const owner = people.find(({ profile }) => profile.id === org.createdById)
    console.log(`  group    ${org.name} (@${org.slug})  owner: ${owner?.person.email ?? "none"}`)

    for (const { person, profile, created, filled } of people) {
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
