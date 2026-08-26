/* Sign in during development without sending an email.
 *
 *   npm run dev:login                    # the seeded admin (SEED_ADMIN_EMAIL)
 *   npm run dev:login -- member          # the seeded member (SEED_MEMBER_EMAIL)
 *   npm run dev:login -- someone@x.org   # any provisioned address
 *
 * Prints a one-time sign-in URL. Open it and the app is signed in as that person.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Supabase's built-in SMTP allows **2 messages per hour, project-wide**, and that cap can
 * only be raised by configuring your own SMTP. Two sign-in attempts an hour is not enough
 * to develop against, and demoing both sides of the permission model means signing in as
 * two different people in quick succession. Hitting it returns:
 *
 *     429 { "code": "over_email_send_rate_limit" }
 *
 * This uses the Admin API's `generateLink`, which mints the same verification token the
 * email would have carried but hands it back instead of sending it. No message is sent, so
 * no quota is consumed, and the resulting session is identical to a real one.
 *
 * ── Why it is a script and not a route ──────────────────────────────────────
 *
 * It needs the secret key, which bypasses RLS and can impersonate any user. A route
 * handler that issues a session for an arbitrary email is a backdoor by construction —
 * gate it on NODE_ENV however carefully you like, and it is still one misconfiguration
 * away from being live. As a local script it has exactly the trust boundary the seed
 * already has: your machine, your .env, never shipped, never reachable over the network.
 *
 * The real fix for the rate limit is custom SMTP (Resend, Postmark, SES) under
 * Authentication → Emails → SMTP Settings, which raises the cap to 30/hour and is required
 * before real parishioners use this anyway. This script stays useful regardless. */

import "dotenv/config"

import { createClient } from "@supabase/supabase-js"

if (process.env.NODE_ENV === "production") {
    console.error("✗ dev:login is a development helper and refuses to run with NODE_ENV=production.")
    process.exit(1)
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SECRET) {
    console.error(
        "✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. See .env.example.",
    )
    process.exit(1)
}

/* Where to land after the link is followed. Must be listed under Authentication → URL
 * Configuration (Site URL, or Redirect URLs) or Supabase refuses the redirect. */
const redirectTo = process.env.DEV_LOGIN_REDIRECT || "http://localhost:3000"

const argument = process.argv[2] ?? "admin"
const email =
    argument === "admin"
        ? process.env.SEED_ADMIN_EMAIL
        : argument === "member"
          ? process.env.SEED_MEMBER_EMAIL
          : argument

if (!email) {
    console.error(
        `✗ No address for "${argument}". Set SEED_ADMIN_EMAIL / SEED_MEMBER_EMAIL, or pass an address.`,
    )
    process.exit(1)
}

const supabase = createClient(URL, SECRET, { auth: { persistSession: false } })

const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
})

if (error) {
    console.error(`✗ Could not generate a link for ${email}: ${error.message}`)
    if (error.message?.toLowerCase().includes("not found")) {
        console.error("  That address has no account. Provision it first — the app is invite-only.")
    }
    process.exit(1)
}

console.log(`\n  Signing in as: ${email}`)
console.log(`  Redirects to:  ${redirectTo}`)
console.log(`\n  Open this once (it is single-use):\n\n${data.properties.action_link}\n`)
/* Length comes from the project's Email OTP Length setting — 6 here, though a fresh Supabase
 * project defaults to 8. Printed rather than hardcoded so this never goes stale. */
const otp = data.properties.email_otp
console.log(`  Or type this ${otp.length}-digit code into the login form: ${otp}\n`)
