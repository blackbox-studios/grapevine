/* Provision the store-review account.
 *
 *     npm run reviewer -- review@throughgrapevine.com --org holy-trinity-cathedral
 *     npm run reviewer -- review@throughgrapevine.com --org holy-trinity-cathedral --revoke
 *     npm run reviewer                      # show the current state of every reviewer account
 *
 * Google and Apple both send someone who has never met this app and cannot be invited into it,
 * because it is invite-only by construction: `signInWithOtp({ shouldCreateUser: false })` means
 * an address with no account can never be sent a code. So the account has to exist before they
 * arrive, and it has to be an ordinary one — a member of a real group, with no elevated role
 * and nothing a compromised login could do to a parish.
 *
 * ── Why this is not the prod seed ────────────────────────────────────────────
 *
 * `seed.prod.js` describes the state the app *launches* in: one group, two admins, and nothing
 * else. A reviewer account is scaffolding for a submission, not part of that state, and it
 * should be removable in one command when review is over — `--revoke`, which takes the
 * membership away and leaves the person, so a resubmission does not have to re-provision.
 *
 * ── Why it completes orientation ─────────────────────────────────────────────
 *
 * `onboardedAt` is stamped here. A reviewer who lands on `/welcome` sees a four-step form
 * asking for a Christian name and a name day, decides the app is broken or that they are being
 * asked for personal data to see a demo, and files it. They should land on the feed.
 *
 * Requires SUPABASE_SECRET_KEY, and writes to whatever DATABASE_URL points at — which for this
 * script is normally production. It prints the target and is additive: no `deleteMany`.
 */

import "dotenv/config"

import { describeDatabase } from "./db-target.mjs"
import { prisma, provisionAuthUser, supabaseAdmin, upsertMembership } from "../prisma/seed-lib.js"

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const option = (name, fallback = null) => {
    const i = argv.indexOf(`--${name}`)
    return i === -1 ? fallback : argv[i + 1]
}

const email = argv.find((arg) => arg.includes("@"))?.toLowerCase() ?? null
const orgSlug = option("org")
const revoking = flag("revoke")

const die = (message) => {
    console.error(`\n✗ ${message}\n`)
    process.exit(1)
}

/* ---------------------------------------------------------------------------
 * List
 * ------------------------------------------------------------------------- */

if (!email) {
    const reviewers = await prisma.profile.findMany({
        where: { handle: { startsWith: "review" } },
        include: { memberships: { include: { org: { select: { name: true, slug: true } } } } },
        orderBy: { createdAt: "asc" },
    })

    console.log(`\n  database: ${describeDatabase()}\n`)

    if (!reviewers.length) {
        console.log("  No reviewer accounts.\n")
        console.log("  Create one:  npm run reviewer -- review@yourdomain.com --org <slug>\n")
    } else {
        for (const person of reviewers) {
            console.log(`  @${person.handle}  ${person.email}`)
            for (const membership of person.memberships) {
                console.log(`      ${membership.status} ${membership.role} in ${membership.org.name}`)
            }
            if (!person.memberships.length) console.log("      (no memberships — cannot see anything)")
        }
        console.log()
    }
    await prisma.$disconnect()
    process.exit(0)
}

/* ---------------------------------------------------------------------------
 * Revoke
 * ------------------------------------------------------------------------- */

console.log(`\n  database: ${describeDatabase()}`)

if (revoking) {
    const profile = await prisma.profile.findUnique({ where: { email } })
    if (!profile) die(`No account for ${email}.`)

    const { count } = await prisma.membership.updateMany({
        where: { profileId: profile.id },
        data: { status: "REVOKED", decidedAt: new Date() },
    })

    console.log(`\n  ✓ Revoked ${count} membership(s) for ${email}.`)
    console.log("    The account remains, so a resubmission needs only --org again.\n")
    await prisma.$disconnect()
    process.exit(0)
}

/* ---------------------------------------------------------------------------
 * Provision
 * ------------------------------------------------------------------------- */

if (!orgSlug) {
    die(
        "Which group should the reviewer see? Pass --org <slug>.\n\n" +
            "  A reviewer with no membership sees an empty app and will reject it —\n" +
            "  `readableOrgIds` is the union of their APPROVED memberships and nothing else.",
    )
}

const org = await prisma.organization.findUnique({ where: { slug: orgSlug } })
if (!org) die(`No group with slug "${orgSlug}".`)

const handle = option("handle", email.split("@")[0].replace(/[^a-z0-9._-]/g, "").slice(0, 20))

const supabase = supabaseAdmin()
const id = await provisionAuthUser(supabase, {
    email,
    firstName: "App",
    lastName: "Review",
    handle,
})

/* Creation-time values only, for the reason `seed.prod.js` states in its header: re-running
 * must never overwrite something a person has since set in the app. The one field asserted on
 * every run is `onboardedAt`, because that is access rather than content — a reviewer stuck
 * behind orientation is the failure this script exists to prevent. */
const profile = await prisma.profile.upsert({
    where: { id },
    update: { onboardedAt: new Date() },
    create: {
        id,
        email,
        handle,
        firstName: "App",
        lastName: "Review",
        vocation: "FAITHFUL",
        onboardedAt: new Date(),
    },
})

await upsertMembership(profile.id, org.id, { role: "MEMBER", status: "APPROVED" })

const posts = await prisma.post.count({ where: { orgId: org.id } })

console.log(`\n  ✓ ${email} is @${profile.handle}, an APPROVED MEMBER of ${org.name}.`)
console.log(`    That group has ${posts} post(s) they will see.`)

if (posts === 0) {
    console.log(
        "\n  ! That group has no posts. A reviewer opening an empty feed has nothing to\n" +
            "    review and may reject the submission — publish a few before submitting.",
    )
}

console.log(
    "\n  Sign-in is still an emailed code to that address. Either hand the mailbox\n" +
        "  password to the reviewer in Play's App access notes, or set REVIEW_EMAIL and\n" +
        "  REVIEW_OTP so the fixed code works. See RELEASING.md §2.\n",
)

await prisma.$disconnect()
