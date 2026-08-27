import "server-only"

import { createRemoteJWKSet, jwtVerify } from "jose"

import { prisma } from "@/lib/db"
import { AppError, ERROR_CODES, forbidden, notFound } from "@/lib/server/errors"
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

const unavailable = (message) => new AppError(ERROR_CODES.UNAVAILABLE, message)

/* Did the token verification fail, or did it never happen?
 *
 * supabase-js reports a transport failure — timeout, DNS, a paused project, an outage — as
 * an `AuthRetryableFetchError` rather than by throwing, so it arrives in the same `error`
 * slot as "this token is not valid". Telling them apart matters more than it looks: a 401
 * makes `lib/api.js` call `expire()`, which signs the viewer out and clears their session.
 * Treating an unreachable auth server as a 401 therefore **destroys valid sessions every
 * time Supabase hiccups**, and reports it to the reader as "Your session has expired",
 * which is both wrong and unactionable — nothing they do to their account will help.
 *
 * Matched on the error's `name`, which is exactly what Supabase's own
 * `isAuthRetryableFetchError` checks. That predicate is not re-exported by `supabase-js`,
 * and reaching into `@supabase/auth-js` for it would take a dependency on a transitive
 * package; the name is the stable part of the contract. */
const isUnreachable = (error) => error?.name === "AuthRetryableFetchError"

const UNREACHABLE_MESSAGE =
    "Can't reach the sign-in service just now. Please try again in a moment."

/* The project's public signing keys, fetched once and cached by `jose` (it re-fetches on
 * an unknown `kid`, rate-limited, which is exactly the behaviour key rotation needs).
 * Module scope so the cache is per process rather than per request. */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
let jwks = null
const signingKeys = () => {
    if (!SUPABASE_URL) throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL.")
    jwks ??= createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
    return jwks
}

/* jose's codes for "this token is not valid", as opposed to "the check could not run".
 * The distinction is the same one `isUnreachable` draws and matters for the same reason:
 * only the first list may produce a 401, because a 401 signs the viewer out. */
const INVALID_TOKEN = new Set([
    "ERR_JWT_EXPIRED",
    "ERR_JWT_CLAIM_VALIDATION_FAILED",
    "ERR_JWT_INVALID",
    "ERR_JWS_INVALID",
    "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
])

/* Verifies the token against Supabase over HTTP. The slow path, kept for two cases the
 * local check cannot answer: a project still signing with the legacy shared HS256 secret
 * (no public key exists to verify against), and the window during a key rotation where a
 * token was signed by a key the JWKS has not published yet. */
const verifyRemotely = async (token) => {
    const { data, error } = await supabaseAnon().auth.getUser(token)
    if (isUnreachable(error)) throw unavailable(UNREACHABLE_MESSAGE)
    if (error || !data?.user) throw unauthenticated("Your session has expired.")
    return data.user.id
}

/* The caller's user id, from a token proven to have been issued by this project.
 *
 * Verified **locally** against the project's published JWKS — Supabase signs with ES256,
 * so the signature can be checked with a public key and needs no round trip to the auth
 * server. Issuer and audience are checked too: a signature alone would accept a token
 * minted by the same project for a different purpose.
 *
 * This used to be `auth.getUser(jwt)` on every single request — a second network service
 * in the path of every read, ~80ms each, and an outage there took the whole API down with
 * it. What is given up is *instant* revocation: a session signed out elsewhere stays
 * verifiable until the access token expires (an hour by default, and the refresh token is
 * already dead, so it cannot be extended). Two things keep that honest — the Profile
 * lookup below, which cuts off anyone deprovisioned, and `Membership.status`, which is
 * read from the database on every authorization decision. If a parish ever needs
 * revocation to bite sooner than the token's lifetime, shorten the JWT expiry in the
 * Supabase dashboard rather than putting an HTTP call back in this path.
 *
 * Never decode without verifying. A JWT payload is base64, not a proof of anything. */
const verifyToken = async (token) => {
    try {
        const { payload } = await jwtVerify(token, signingKeys(), {
            issuer: `${SUPABASE_URL}/auth/v1`,
            audience: "authenticated",
        })
        if (!payload.sub) throw unauthenticated("Your session has expired.")
        return payload.sub
    } catch (error) {
        if (error instanceof AppError) throw error

        /* No public key matches, or the token is signed with an algorithm this project's
         * JWKS cannot describe (legacy HS256). Not a verdict on the token — ask Supabase. */
        if (
            error?.code === "ERR_JWKS_NO_MATCHING_KEY" ||
            error?.code === "ERR_JOSE_ALG_NOT_ALLOWED"
        ) {
            return verifyRemotely(token)
        }

        if (INVALID_TOKEN.has(error?.code)) throw unauthenticated("Your session has expired.")

        /* Everything left is the check failing to run — a JWKS fetch that timed out, DNS,
         * a paused project. The viewer's session is very probably fine and signing them
         * out over an outage would turn a blip into a forced re-authentication for
         * everybody, so this is a 503 and explicitly not a 401. */
        throw unavailable(UNREACHABLE_MESSAGE)
    }
}

/* Every membership the viewer holds, with its organization — loaded with the profile
 * rather than by any of the queries that used to ask for it separately.
 *
 * Every status, not just APPROVED, because the callers need to tell three states apart:
 * `getViewer` shows a removed member the access-removed screen (a filtered-out REVOKED row
 * is indistinguishable from never having been admitted), and `requireMembership` answers
 * 404 for a group the viewer was never in but 403 for one they were removed from. Filter
 * in the caller; the set is a handful of rows.
 *
 * `status: "asc"` is declaration order, not alphabetical — Postgres sorts an enum by how
 * it was declared, which in schema.prisma is APPROVED, REVOKED. So the primary group leads
 * and removed ones settle at the bottom, and reordering those values silently reorders
 * every consumer of this. */
const viewerMemberships = {
    include: { org: true },
    orderBy: [{ status: "asc" }, { admittedAt: "asc" }],
}

/* Resolves the caller's Profile, or throws 401.
 *
 * Two steps, and both are load-bearing:
 *
 *  1. **Verify the token** (see `verifyToken`) — proving who is asking.
 *  2. **Resolve the local Profile by that id.** `auth.users` holds credentials; this app's
 *     data hangs off `Profile`, keyed by the same uuid. A verified token with no Profile
 *     means a user exists in Supabase but was never provisioned into an organization, and
 *     that is *not* a valid session for this app — it is the state an interrupted invite
 *     leaves behind, and it must not read anything.
 *
 * **The viewer it returns carries `memberships`, and that is the point.** Authorization
 * asks about them on every request — which groups may be read, whether this one may be
 * posted into, who wears the check — and each of those used to be its own query. Against
 * Supabase's pooler a round trip is tens of milliseconds and the query itself is nothing,
 * so the win is in the count: one statement here replaces two to four per request. Every
 * helper below therefore reads from this snapshot instead of querying, and none of them is
 * async any more. */
export const requireViewer = async (request) => {
    const token = bearerToken(request)
    if (!token) throw unauthenticated()

    const userId = await verifyToken(token)

    const profile = await prisma.profile.findUnique({
        where: { id: userId },
        include: { memberships: viewerMemberships },
        /* One statement with a lateral join instead of one per relation. */
        relationLoadStrategy: "join",
    })
    if (!profile) throw unauthenticated("This account has not been set up yet.")

    return profile
}

/* The viewer's membership in one group, or null — read from the snapshot `requireViewer`
 * loaded, never from a query.
 *
 * Throws rather than returning null when the snapshot is missing, because that means a
 * viewer reached a service without going through `requireViewer`, and silently answering
 * "no membership" would turn a broken call path into a plausible-looking 404. */
export const membershipIn = (viewer, orgId) => {
    if (!Array.isArray(viewer?.memberships)) {
        throw new Error(
            "membershipIn needs a viewer from requireViewer — its memberships are missing.",
        )
    }
    return viewer.memberships.find((membership) => membership.orgId === orgId) ?? null
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
export const requireMembership = (viewer, orgId, { role } = {}) => {
    const membership = membershipIn(viewer, orgId)

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

/* ---------------------------------------------------------------------------
 * Platform authority
 * ------------------------------------------------------------------------- */

/* Is this viewer a platform owner — the person who pays for Grapevine?
 *
 * **This answers one question and must never be asked as a second one.** It is the right to
 * bring a group into existence and to delete a group you brought, and that is the whole of
 * it. It is not "is this person important", it is not a read grant, and it is deliberately
 * not consulted by `requireMembership`, `readableOrgIds`, or anything that decides what a
 * viewer may see. An owner has exactly the standing in a parish they did not create that any
 * other stranger has: none.
 *
 * The authority an owner *does* hold inside a group they created is a real APPROVED ADMIN
 * `Membership`, written by `createOrg` and protected from removal by `updateMembership`. So
 * every read path keeps asking the same one question it always asked, and adding this axis
 * widened no existing check — which is the only reason a platform role can be added to an
 * app like this without becoming a backdoor. */
export const isPlatformOwner = (viewer) => viewer?.platformRole === "OWNER"

/* Asserts platform ownership, for the two endpoints that create and delete groups.
 *
 * 403 rather than 404: unlike a group id, the *existence* of these endpoints is not a
 * secret, and there is nothing to leak by saying plainly that this is not yours to do. */
export const requirePlatformOwner = (viewer) => {
    if (!isPlatformOwner(viewer)) {
        throw forbidden("Only a Grapevine owner can do that.")
    }
    return viewer
}

/* The organizations whose posts a viewer may read: every APPROVED membership.
 *
 * Returned as an array of ids rather than a single id because the feed is already a union
 * — and it is about to be a wider one. A diocese will contribute its child parishes'
 * posts, and the planned follow feature will add posts from followed people. Both widen
 * this set; neither changes its caller.
 *
 * When either of those lands and the set is no longer just the viewer's own memberships,
 * this becomes a query again — but it should be the *only* one, and it belongs here rather
 * than inlined into the feed service. */
export const readableOrgIds = (viewer) => {
    if (!Array.isArray(viewer?.memberships)) {
        throw new Error(
            "readableOrgIds needs a viewer from requireViewer — its memberships are missing.",
        )
    }
    return viewer.memberships
        .filter((membership) => membership.status === "APPROVED")
        .map((membership) => membership.orgId)
}

/* The viewer's memberships, APPROVED first, as `/api/me` and the Groups surface read them.
 * A named accessor rather than each caller re-filtering, so "which groups is this person
 * in" has one answer. */
export const approvedMemberships = (viewer) =>
    viewer.memberships.filter((membership) => membership.status === "APPROVED")
