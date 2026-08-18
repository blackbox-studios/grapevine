/* Rewind an account to "brand new", so first-run orientation can be tested again.
 *
 *   npm run dev:reset-member                    # the seeded admin (SEED_ADMIN_EMAIL)
 *   npm run dev:reset-member -- member          # the seeded member
 *   npm run dev:reset-member -- someone@x.org   # anyone provisioned
 *
 * Clears the three columns that make someone look established — `onboardedAt`, `birthday`
 * and `lastSeenAt` — without touching their membership, posts or comments. The next sign-in
 * therefore goes through /welcome, and the roster shows them as "Not yet signed in" until
 * they do.
 *
 * This exists because the alternative is remembering a psql incantation, and the state it
 * resets is exactly the state you need to churn while building the orientation screen.
 *
 * Development only. It is a script rather than a route for the same reason `dev-login` is:
 * anything that rewrites another person's profile has no business being reachable over the
 * network, however carefully it is gated. */

import "dotenv/config"

import { PrismaClient } from "@prisma/client"

if (process.env.NODE_ENV === "production") {
    console.error("✗ dev:reset-member refuses to run with NODE_ENV=production.")
    process.exit(1)
}

const prisma = new PrismaClient()

const argument = process.argv[2] ?? "admin"
const email =
    argument === "admin"
        ? process.env.SEED_ADMIN_EMAIL
        : argument === "member"
          ? process.env.SEED_MEMBER_EMAIL
          : argument

if (!email) {
    console.error(
        `✗ No address for "${argument}". Set SEED_ADMIN_EMAIL / SEED_MEMBER_EMAIL, or pass one.`,
    )
    process.exit(1)
}

const profile = await prisma.profile.findUnique({ where: { email } })

if (!profile) {
    console.error(`✗ No profile for ${email}. Admit them first — the app is invite-only.`)
    await prisma.$disconnect()
    process.exit(1)
}

await prisma.profile.update({
    where: { id: profile.id },
    data: { onboardedAt: null, birthday: null, lastSeenAt: null },
})

console.log(`\n  ✓ ${email} reset to a brand-new member.`)
console.log("    onboardedAt, birthday and lastSeenAt cleared; membership untouched.")
console.log(`\n    Next: npm run dev:login -- ${argument}\n`)

await prisma.$disconnect()
