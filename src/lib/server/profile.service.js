import "server-only"

import { prisma } from "@/lib/db"
import { requireMembership } from "@/lib/server/auth"
import { projectOrg, projectViewer } from "@/lib/server/projections"

/* The viewer's own identity and group memberships.
 *
 * `GET /api/me` is the app's session probe: the client holds a Supabase token, but a
 * token only proves *who* someone is, not what this application knows about them. This is
 * what turns a verified token into a viewer with a name, a vocation, and a role — and it
 * is the call that decides whether the admin composer appears.
 *
 * It also fills the gap the static export leaves. With no server rendering the first
 * paint, there is nothing to embed a bootstrapped user into the HTML; the client has to
 * ask. That single round trip on boot is the whole cost of having no middleware. */

/* Memberships with their organizations, ordered so the primary group is first.
 *
 * APPROVED before PENDING so `projectViewer` picks a usable group as the primary one, and
 * oldest first within that, so the group someone has belonged to longest wins rather than
 * whichever they most recently requested. */
const membershipsFor = (profileId) =>
    prisma.membership.findMany({
        where: { profileId, status: { in: ["APPROVED", "PENDING"] } },
        include: { org: true },
        orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
    })

/* The signed-in viewer, with every group they belong to. */
export const getViewer = async (viewer) => {
    const memberships = await membershipsFor(viewer.id)
    return projectViewer(viewer, memberships)
}

/* Everyone in a group, for its admins.
 *
 * Admin-only, and the check is `requireMembership(..., { role: "ADMIN" })`: a member list
 * is a roster of a parish's congregation, which is exactly the kind of thing that should
 * not be readable by anyone who merely belongs to it.
 *
 * Returns PENDING rows alongside APPROVED ones, ordered so requests awaiting a decision
 * come first — this list doubles as the approval queue, and an admin's reason for opening
 * it is usually someone waiting.
 *
 * `status: "asc"` is what produces that order, and it is not alphabetical: Postgres sorts
 * an enum by its *declaration* order, which in schema.prisma is PENDING, APPROVED,
 * REJECTED, REVOKED. Reordering those values in the schema silently reorders this list. */
export const listMembers = async (viewer, orgId) => {
    await requireMembership(viewer.id, orgId, { role: "ADMIN" })

    const memberships = await prisma.membership.findMany({
        where: { orgId },
        include: { profile: true },
        orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
    })

    return {
        items: memberships.map((membership) => ({
            id: membership.profile.id,
            membershipId: membership.id,
            email: membership.profile.email,
            handle: membership.profile.handle,
            fullName: membership.profile.fullName,
            avatar: membership.profile.avatarUrl,
            vocation: membership.profile.vocation,
            verified: membership.profile.verified,
            role: membership.role,
            status: membership.status,
            requestedAt: membership.requestedAt.toISOString(),
            decidedAt: membership.decidedAt?.toISOString() ?? null,
        })),
        nextCursor: null,
    }
}

/* The viewer's groups — the Groups surface.
 *
 * Not paginated: a person belongs to a handful of parishes, not a feed's worth. It still
 * returns the `{ items, nextCursor }` collection shape with a null cursor, because the
 * contract says a collection is always that object even where pagination looks
 * unnecessary — adding a key to an object is non-breaking, turning an array into one is
 * not. */
export const listOrgs = async (viewer) => {
    const memberships = await membershipsFor(viewer.id)
    return {
        items: memberships.map((membership) => projectOrg(membership.org, membership)),
        nextCursor: null,
    }
}
