import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { updateMembership } from "@/lib/server/profile.service"

/* PATCH /api/memberships/:membershipId — approve, revoke, or re-rank a member.
 *
 * Body: { status?, role?, vocation? }. One endpoint for all three because they are the
 * same authorization question about the same row; four endpoints would be four places to
 * keep that check correct.
 *
 * PATCH rather than PUT: callers send only the field they are changing, and the roster
 * never holds a complete membership to replace. */
export const dynamic = "force-dynamic"

export const PATCH = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { membershipId } = await params
    const { status, role, vocation } = await request.json()
    return sendResource(await updateMembership(viewer, membershipId, { status, role, vocation }))
})

export const OPTIONS = preflight
