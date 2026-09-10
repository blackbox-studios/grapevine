/* Erase one person — profile, content and credential.
 *
 *     npm run erase -- someone@parish.org             # report what would happen, change nothing
 *     npm run erase -- someone@parish.org --confirm   # do it
 *
 * The answer to a right-to-erasure request (GDPR Art. 17 and its UK equivalent), which applies
 * to any parishioner in scope regardless of what an app store asks for.
 *
 * ── Why this is a script and not a route ────────────────────────────────────
 *
 * Google Play's account-deletion requirement is conditional on a user being able to *create*
 * an account in the app, and nobody can: `signInWithOtp({ shouldCreateUser: false })` means an
 * admin provisions every account and a person never makes one. So the in-app deletion path the
 * policy would otherwise mandate is not owed here.
 *
 * It is also, on reflection, the wrong control for this app. Membership is invite-only, so
 * self-deletion is a one-way door: the person cannot return without an admin re-provisioning
 * them, which turns a mis-tap into somebody else's afternoon. A parish is a small group of
 * people who can ask, and the honest shape of "delete me" here is a request to the priest.
 *
 * What must not happen is that request being answered by hand in a database console. The two
 * refusals below are states nobody inside the app can repair, and neither is obvious while
 * you are looking at one person's row.
 *
 * ── What one delete takes ───────────────────────────────────────────────────
 *
 * `Profile` is the root of every cascade in the schema, so removing that row removes the
 * memberships, posts, comments, likes, follows, notifications, device tokens, conversation
 * participations and messages with it — and, through `CryptoDevice`, the person's published
 * key bundles and every message envelope addressed to them. The Supabase credential is
 * deleted *after*, because `requireViewer` refuses a token with no profile behind it — so a
 * failure between the two leaves someone who cannot use the app rather than someone still
 * posting to a parish feed.
 *
 * **The plaintext of their conversations is not here to delete**, and that is the design
 * rather than a gap: messages are end-to-end encrypted, so the only readable copies are on
 * the devices of the people who were in the conversation. Erasing this account destroys its
 * own keys and its own envelopes; the other party's phone keeps what it already decrypted,
 * exactly as it would keep a letter.
 *
 * Writes to whatever DATABASE_URL points at, which for this script is normally production. It
 * prints the target and refuses to do anything without --confirm.
 */

import "dotenv/config"

import { describeDatabase } from "./db-target.mjs"
import { prisma, supabaseAdmin } from "../prisma/seed-lib.js"

const argv = process.argv.slice(2)
const email = argv.find((arg) => arg.includes("@"))?.toLowerCase() ?? null
const confirmed = argv.includes("--confirm")

const die = (message) => {
    console.error(`\n✗ ${message}\n`)
    process.exit(1)
}

if (!email) {
    die(
        "Which account? Pass an email address.\n\n" +
            "      npm run erase -- someone@parish.org             (dry run)\n" +
            "      npm run erase -- someone@parish.org --confirm",
    )
}

const listNames = (names) =>
    names.length === 1
        ? `"${names[0]}"`
        : `${names.slice(0, -1).map((name) => `"${name}"`).join(", ")} and "${names.at(-1)}"`

/* The two departures that leave something nobody can fix.
 *
 * `Organization.createdById` is `SetNull`, and `canDeleteOrg` requires it to equal the viewer's
 * id — so erasing an owner does not merely orphan their groups, it makes them permanently
 * undeletable, because the one id that could authorize it is gone.
 *
 * A group's last admin is the only person who can publish into it, invite anyone, or promote a
 * successor. `updateMembership` already refuses to let an admin demote themselves for exactly
 * this reason. A sole admin of an *empty* group passes: there is nobody to strand, and
 * "promote a successor" is not an instruction one person alone can carry out. */
const blockers = async (profile) => {
    const [createdOrgs, adminMemberships] = await Promise.all([
        prisma.organization.findMany({
            where: { createdById: profile.id },
            select: { name: true },
            orderBy: { name: "asc" },
        }),
        prisma.membership.findMany({
            where: { profileId: profile.id, status: "APPROVED", role: "ADMIN" },
            select: { orgId: true, org: { select: { name: true } } },
        }),
    ])

    if (createdOrgs.length) {
        return (
            `They created ${listNames(createdOrgs.map((org) => org.name))}.\n` +
            "    Delete or hand over those groups first — once this account is gone nobody can,\n" +
            "    because the right to delete a group belongs to the account that created it."
        )
    }

    if (!adminMemberships.length) return null

    const counts = await prisma.membership.groupBy({
        by: ["orgId", "role"],
        where: {
            orgId: { in: adminMemberships.map((membership) => membership.orgId) },
            status: "APPROVED",
            profileId: { not: profile.id },
        },
        _count: { _all: true },
    })

    const otherAdmins = new Set(
        counts.filter((row) => row.role === "ADMIN" && row._count._all > 0).map((row) => row.orgId),
    )
    const otherMembers = new Set(counts.filter((row) => row._count._all > 0).map((row) => row.orgId))

    const stranded = adminMemberships.filter(
        (membership) => !otherAdmins.has(membership.orgId) && otherMembers.has(membership.orgId),
    )

    if (stranded.length) {
        return (
            `They are the only admin of ${listNames(stranded.map((m) => m.org.name))}.\n` +
            "    Make somebody else an admin there first, or the group is left with nobody who\n" +
            "    can publish, invite, or manage its roster."
        )
    }

    return null
}

/* ---------------------------------------------------------------------------
 * Report
 * ------------------------------------------------------------------------- */

console.log(`\n  database: ${describeDatabase()}`)

const profile = await prisma.profile.findUnique({
    where: { email },
    include: {
        memberships: { include: { org: { select: { name: true } } } },
        _count: { select: { posts: true, comments: true, followers: true, following: true } },
    },
})

if (!profile) die(`No account for ${email}.`)

const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "(no name)"
console.log(`\n  @${profile.handle} — ${name}, ${profile.vocation}`)
console.log(
    `  ${profile._count.posts} post(s), ${profile._count.comments} comment(s), ` +
        `${profile._count.followers} follower(s), ${profile._count.following} following`,
)
for (const membership of profile.memberships) {
    console.log(`      ${membership.status} ${membership.role} in ${membership.org.name}`)
}

const blocker = await blockers(profile)
if (blocker) die(`Refusing to erase @${profile.handle}.\n\n    ${blocker}`)

if (!confirmed) {
    console.log(
        "\n  Nothing was changed. All of the above is destroyed permanently by:\n\n" +
            `      npm run erase -- ${email} --confirm\n`,
    )
    await prisma.$disconnect()
    process.exit(0)
}

/* ---------------------------------------------------------------------------
 * Erase
 * ------------------------------------------------------------------------- */

await prisma.profile.delete({ where: { id: profile.id } })
console.log(`\n  ✓ Profile and all cascaded rows deleted.`)

try {
    const { error } = await supabaseAdmin().auth.admin.deleteUser(profile.id)
    if (error) throw error
    console.log("  ✓ Supabase auth user deleted.")
} catch (error) {
    console.error(
        `\n  ! The profile is gone but its auth user survived: ${error.message}\n` +
            "    They cannot use the app — requireViewer refuses a token with no profile — but\n" +
            "    the credential should still be removed from the Supabase dashboard.",
    )
}

console.log(`\n  @${profile.handle} is erased.\n`)

await prisma.$disconnect()
