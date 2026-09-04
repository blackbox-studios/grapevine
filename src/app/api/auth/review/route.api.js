import { timingSafeEqual } from "node:crypto"

import { OTP_LENGTH } from "@/lib/constants"
import { preflight, route } from "@/lib/server/handler"
import { invalid, notFound } from "@/lib/server/errors"
import { sendResource } from "@/lib/server/respond"
import { supabaseAdmin } from "@/lib/server/supabase"

/* POST /api/auth/review — the store reviewer's way in.
 *
 * Google and Apple both send someone who has never met this app and, because it is invite-only
 * (`shouldCreateUser: false`), can never be sent a code by asking for one. `provision-reviewer.mjs`
 * creates the account; this is how the person sitting at it signs in without an inbox.
 *
 * ── What this deliberately does NOT do ──────────────────────────────────────
 *
 * **It never mints a session.** `dev-login.mjs`'s header states the rule this file lives under:
 * a route that issues a session for an arbitrary address is a backdoor by construction. So this
 * one issues nothing. It answers a single question — "what is Supabase's current one-time code
 * for this one address" — and hands that back. The client then runs the ordinary
 * `verifyOtp` flow with it, exactly as if the reviewer had read the code out of an inbox.
 * Supabase still performs the authentication, the code still expires on Supabase's schedule,
 * and there is no second way to obtain a session anywhere in the app.
 *
 * That distinction bounds the damage. Whoever holds REVIEW_OTP can sign in as one hardcoded,
 * unprivileged account. They cannot sign in as anybody else, because the address is compared
 * against a constant before anything happens, and `generateLink` is called with that constant
 * rather than with anything the caller sent.
 *
 * ── Turning it off ──────────────────────────────────────────────────────────
 *
 * Unset REVIEW_EMAIL or REVIEW_OTP and every request here 404s — the same posture push takes
 * when FCM is unconfigured. Do that once review is over; `npm run reviewer -- <email> --revoke`
 * is the other half, and it takes the account's access away rather than the door.
 */

const REVIEW_EMAIL = process.env.REVIEW_EMAIL?.trim().toLowerCase()
const REVIEW_OTP = process.env.REVIEW_OTP?.trim()

/* **The shape is dictated by the code field, not chosen here.** `<InputOTP maxLength={OTP_LENGTH}>`
 * on the login screen is exactly `OTP_LENGTH` slots, so a code of any other length simply cannot
 * be typed — the route would be unreachable and the failure would look like a broken app to the
 * one person who must not see that. (`codeSchema` accepts 6-10 digits, but that slack exists so a
 * change to the Supabase dashboard setting cannot lock real users out; it is not licence to use a
 * longer code here.) Derived from the constant so the two cannot drift.
 *
 * **Six digits is only a million combinations, and that is the whole reason this must be
 * temporary.** The attempt cap below is per-process, which on a serverless deploy means an
 * attacker gets a fresh allowance per cold instance, so it slows guessing rather than stopping
 * it. What actually bounds the damage is that the account is an ordinary member of a demo group
 * with no privileges, and that both variables are unset the moment review finishes. Leaving this
 * configured indefinitely is the misuse to avoid. */
const REVIEW_OTP_PATTERN = new RegExp(`^\\d{${OTP_LENGTH}}$`)

const configured = () =>
    Boolean(REVIEW_EMAIL && REVIEW_OTP && REVIEW_OTP_PATTERN.test(REVIEW_OTP))

/* Length is compared first because `timingSafeEqual` throws on a mismatch rather than
 * returning false, and the length of a secret is not the secret. */
const matches = (given, expected) => {
    const a = Buffer.from(String(given ?? ""), "utf8")
    const b = Buffer.from(expected, "utf8")
    return a.length === b.length && timingSafeEqual(a, b)
}

/* One in-process counter, reset on success. This is a single-instance guard, not a
 * distributed one — it exists so an unattended script cannot walk the space at full speed,
 * and the real protection is the secret's length. */
const MAX_ATTEMPTS = 10
let failures = 0

export const dynamic = "force-dynamic"

export const POST = route(async (request) => {
    /* 404 rather than 403 when unconfigured, and for a wrong address: a route that answers
     * differently for the review address than for any other confirms the address exists. */
    if (!configured()) throw notFound("Not found.")

    const { email, code } = await request.json().catch(() => ({}))

    if (String(email ?? "").trim().toLowerCase() !== REVIEW_EMAIL) throw notFound("Not found.")

    if (failures >= MAX_ATTEMPTS) {
        throw invalid("Too many attempts. Restart the server to reset.", { code: "Locked" })
    }

    if (!matches(code, REVIEW_OTP)) {
        failures += 1
        throw invalid("That code is not valid.", { code: "Does not match" })
    }

    failures = 0

    /* `generateLink` mints the same verification token the email would have carried and hands
     * it back instead of sending it — no message goes out, so this consumes none of the hourly
     * quota a reviewer retrying could otherwise exhaust. REVIEW_EMAIL is passed, never the
     * caller's `email`, so the compare above is the only thing that can select an account. */
    const { data, error } = await supabaseAdmin().auth.admin.generateLink({
        type: "magiclink",
        email: REVIEW_EMAIL,
    })

    if (error) {
        throw invalid(
            "The review account is not provisioned. Run: npm run reviewer -- <email> --org <slug>",
            { code: "No account" },
        )
    }

    console.warn(`Review sign-in issued for ${REVIEW_EMAIL}`)

    return sendResource({ token: data.properties.email_otp })
})

export const OPTIONS = preflight
