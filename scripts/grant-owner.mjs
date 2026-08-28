/* Grant or revoke platform ownership — the back door for `Profile.platformRole`.
 *
 *   npm run owner                            # list every current owner
 *   npm run owner -- priest@parish.org       # grant OWNER
 *   npm run owner -- --revoke someone@x.org  # take it back
 *
 * ── What an owner is ────────────────────────────────────────────────────────
 *
 * The subscriber. Someone buys Grapevine for their parish, and what they buy is the right to
 * *build*: to create groups and to delete the ones they created. Inside a group they created
 * they are an ordinary ADMIN — by a real `Membership` row that `createOrg` writes and that
 * nobody can revoke — and in a group they did not create they are an ordinary member, or
 * nothing at all. OWNER is not a master key: it opens no parish's feed and no parish's
 * roster. See the `PlatformRole` note in `prisma/schema.prisma`.
 *
 * Onboarding a new customer is therefore: run this, tell them to sign in. They land on
 * /welcome, name themselves, and create their first group. No deploy, no seed edit.
 *
 * ── Why this is a script and not an endpoint ────────────────────────────────
 *
 * Nothing in `/api` writes `platform_role`, on purpose. An endpoint that grants platform
 * authority is a privilege-escalation surface standing in front of a role that changes hands
 * a few times a year — the wrong trade in every direction. As a local script it has exactly
 * the trust boundary the seeds already have: your machine, your `.env`, never shipped, never
 * reachable over the network. It is also the seam a billing webhook plugs into later; that
 * webhook should call this logic on the server it already trusts, not add a route.
 *
 * ── It provisions ──────────────────────────────────────────────────────────
 *
 * A brand-new customer has no account, and the app is invite-only — `shouldCreateUser: false`
 * means an address with no `auth.users` row can never be sent a sign-in code. So granting
 * ownership to an unknown address creates the Supabase user and the Profile too, exactly as
 * admission does, which is what makes "they bought it, now let them in" a single command.
 * That needs SUPABASE_SECRET_KEY. Granting to somebody who already has a profile does not.
 */

import "dotenv/config"

import { describeDatabase } from "./db-target.mjs"
import { handleFromEmail, prisma, provisionAuthUser, supabaseAdmin } from "../prisma/seed-lib.js"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const args = process.argv.slice(2)
const revoke = args.includes("--revoke")
const email = args.find((arg) => !arg.startsWith("--"))?.trim().toLowerCase()

/* Every owner, with the groups each of them created. This is the whole platform-authority
 * picture in one query, and it is what you run before changing anything. */
const list = async () => {
    const owners = await prisma.profile.findMany({
        where: { platformRole: "OWNER" },
        include: { orgsCreated: { select: { name: true, slug: true } } },
        orderBy: { email: "asc" },
    })

    if (owners.length === 0) {
        console.log("\n  No owners. Grant one with: npm run owner -- someone@example.org\n")
        return
    }

    console.log(`\n  ${owners.length} owner${owners.length === 1 ? "" : "s"}:\n`)
    for (const owner of owners) {
        const groups = owner.orgsCreated.map((org) => org.slug).join(", ") || "no groups yet"
        console.log(`  ${owner.email.padEnd(32)} @${owner.handle.padEnd(16)} ${groups}`)
    }
    console.log()
}

const uniqueHandle = async (base) => {
    for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = attempt === 0 ? base : `${base}${attempt + 1}`
        const taken = await prisma.profile.findUnique({ where: { handle: candidate } })
        if (!taken) return candidate
    }
    return `${base}-${Math.random().toString(36).slice(2, 7)}`
}

/* The profile to act on, created along with its Supabase user if the address is new.
 *
 * The auth user comes first. If that fails there is no orphaned Profile to clean up, whereas
 * the reverse order leaves a person who appears in the database and can never sign in — the
 * same ordering, and the same reason, as `admitOne`. */
const resolveProfile = async () => {
    const existing = await prisma.profile.findUnique({ where: { email } })
    if (existing) return { profile: existing, created: false }

    if (revoke) {
        throw new Error(`No profile for ${email}. Nothing to revoke.`)
    }

    const id = await provisionAuthUser(supabaseAdmin(), { email })

    /* A profile may already exist under this id with a different address — the same person
     * signed in before their email was corrected. Upsert rather than create so that is a
     * repair instead of a unique-constraint failure. */
    const profile = await prisma.profile.upsert({
        where: { id },
        update: { email },
        create: {
            id,
            email,
            /* A placeholder, like every provisional handle in this app: /welcome asks them to
             * choose one and overwrites it. Suffixed on collision so two owners at the same
             * local part cannot fail each other's grant. */
            handle: await uniqueHandle(handleFromEmail(email)),
        },
    })
    return { profile, created: true }
}

const main = async () => {
    console.log(`\n→ database: ${describeDatabase()}`)

    if (!email) {
        await list()
        return
    }
    if (!EMAIL_PATTERN.test(email)) {
        throw new Error(`"${email}" is not a valid email address.`)
    }

    const { profile, created } = await resolveProfile()
    const role = revoke ? "NONE" : "OWNER"

    if (profile.platformRole === role) {
        console.log(`\n  ${email} is already ${revoke ? "not an owner" : "an owner"}. No change.\n`)
        return
    }

    await prisma.profile.update({ where: { id: profile.id }, data: { platformRole: role } })

    if (revoke) {
        /* Revoking ownership deliberately leaves their groups and their memberships alone.
         * The groups they created keep running with the admins they have; what they lose is
         * the ability to create more and to delete those. Tearing down a parish because a
         * subscription lapsed is a decision for a person, not a side effect of this flag. */
        const groups = await prisma.organization.count({ where: { createdById: profile.id } })
        console.log(`\n✓ ${email} is no longer an owner.`)
        if (groups > 0) {
            console.log(
                `  ${groups} group${groups === 1 ? "" : "s"} they created stay as they are, ` +
                    "with their memberships intact.",
            )
        }
        console.log()
        return
    }

    console.log(`\n✓ ${email} is now an owner${created ? " (account provisioned)" : ""}.`)
    console.log("  They sign in with the emailed code, then create their groups.\n")
}

main()
    .catch((error) => {
        console.error(`\n✗ ${error.message}\n`)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
