import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendCollection } from "@/lib/server/respond"
import { listMembers } from "@/lib/server/profile.service"

/* GET /api/orgs/:orgId/members — the group's roster, for its admins.
 *
 * Admin-only: a parish's member list is its congregation, not something every member
 * should be able to enumerate. A non-admin member gets 403; a non-member gets 404. */
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { orgId } = await params
    const { items, nextCursor } = await listMembers(viewer, orgId)
    return sendCollection(items, nextCursor)
})

export const OPTIONS = preflight
