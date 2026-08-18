import "server-only"

import { prisma } from "@/lib/db"
import { AppError, ERROR_CODES, notFound } from "@/lib/server/errors"
import { supabaseAnon } from "@/lib/server/supabase"

/* Authentication and authorization for the API.
 *
 * Every handler that touches user data starts with `requireViewer(request)`, and every
 * handler that touches an organization's data follows it with `requireMembership(...)`.
 * Those two functions are the entire access-control surface — if a service can be reached
 * without passing through them, that is the bug.
 *
 * **Why the check is here and not in middleware.** The app also ships as a static export
 * for Capacitor, and `output: "export"` drops `src/middleware.js` silently. Anything that
 * looks like a per-request server gate is therefore forbidden on principle: it would work
 * on the web, vanish on native, and warn nobody. Authorization lives in the service call
 * path, which both targets share, because both targets talk to *this* API over HTTP.
 *
 * **RLS is not a substitute for this, and this is not a substitute for RLS.** They defend
 * different doors, and both are load-bearing:
 *
 *  - *This file* is what protects `/api`. Prisma connects as the table owner, which is
 *    exempt from RLS, so no policy would ever apply to these queries. Every rule the
 *    product has about who may read a parish's posts is expressed here and nowhere else.
 *  - *`prisma/policies.sql`* is what protects the tables from Supabase's Data API — the
 *    auto-generated REST layer that answers to the publishable key embedded in our own
 *    client bundle. It bypasses this file entirely. Without RLS and revoked grants, every
 *    check below is a front door beside an open window.
 *
 * It is a mistake (one made in an earlier revision of this file) to reason that because
 * the app never calls the Data API, the Data API is not part of the attack surface. It is
 * reachable by anyone holding a key we publish on purpose. */

/* Pulls the bearer token off the request. Returns null when absent or malformed rather
 * than throwing, so callers can distinguish "anonymous" from "bad token" if they need to. */
const bearerToken = (request) => {
    const header = request.headers.get("authorization") ?? ""
    const [scheme, token] = header.split(" ")
    if (!/^bearer$/i.test(scheme ?? "") || !token) return null
    return token.trim() || null
}

const unauthenticated = (message = "Sign in to continue.") =>
    new AppError(ERROR_CODES.UNAUTHENTICATED, message)

const forbidden = (message) => new AppError(ERROR_CODES.PERMISSION_DENIED, message)

/* Resolves the caller's Profile, or throws 401.
 *
 * Two steps, and both are load-bearing:
 *
 *  1. **Verify the token with Supabase.** `auth.getUser(jwt)` checks the signature and the
 *     expiry against the project that issued it. Never trust a decoded JWT body without
 *     this — the payload is base64, not a proof of anything.
 *  2. **Resolve the local Profile by that id.** `auth.users` holds credentials; this app's
 *     data hangs off `Profile`, keyed by the same uuid. A verified token with no Profile
 *     means a user exists in Supabase but was never provisioned into an organization, and
 *     that is *not* a valid session for this app — it is the state an interrupted invite
 *     leaves behind, and it must not read anything.
 *
 * The verification is a network round trip to Supabase per request. That is the honest
 * trade for correctness here; if it shows up in latency, verify the signature locally
 * against the project's JWKS with `jose` and keep step 2 exactly as it is. */
export const requireViewer = async (request) => {
    const token = bearerToken(request)
    if (!token) throw unauthenticated()

    const { data, error } = await supabaseAnon().auth.getUser(token)
    if (error || !data?.user) throw unauthenticated("Your session has expired.")

    const profile = await prisma.profile.findUnique({ where: { id: data.user.id } })
    if (!profile) throw unauthenticated("This account has not been set up yet.")

    return profile
}

/* Asserts the viewer holds an APPROVED membership in `orgId`, and optionally that it
 * carries a specific role. Returns the membership so a caller can read it without a
 * second query.
 *
 * The failure modes are deliberately not symmetrical:
 *
 *  - **No membership at all → 404, not 403.** A parish the viewer was never approved into
 *     should not be confirmable by probing ids. Returning 403 would leak the existence of
 *     every organization in the system, which for a diocese-scoped app is real
 *     information about real communities. This is the "prefer 404 where existence is
 *     itself sensitive" rule from the API contract.
 *  - **Membership present but wrong role → 403.** The viewer already knows this
 *     organization exists, so there is nothing left to protect; say plainly that the
 *     action needs a higher role.
 *  - **REVOKED → 403, not 404.** They were in this parish and know it exists, so hiding
 *     it now would only be confusing; the honest answer is that access was removed. */
export const requireMembership = async (profileId, orgId, { role } = {}) => {
    const membership = await prisma.membership.findUnique({
        where: { profileId_orgId: { profileId, orgId } },
    })

    if (!membership) {
        throw notFound("Group not found.")
    }

    if (membership.status !== "APPROVED") {
        throw forbidden("Your access to this group has been revoked.")
    }

    if (role && membership.role !== role) {
        throw forbidden("Only group admins can do that.")
    }

    return membership
}

/* The organizations whose posts a viewer may read: every APPROVED membership.
 *
 * Returned as an array of ids rather than a single id because the feed is already a union
 * — and it is about to be a wider one. A diocese will contribute its child parishes'
 * posts, and the planned follow feature will add posts from followed people. Both widen
 * this set; neither changes its caller. */
export const readableOrgIds = async (profileId) => {
    const memberships = await prisma.membership.findMany({
        where: { profileId, status: "APPROVED" },
        select: { orgId: true },
    })
    return memberships.map((membership) => membership.orgId)
}
