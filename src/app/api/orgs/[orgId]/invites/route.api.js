import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { inviteMembers } from "@/lib/server/profile.service"

/* POST /api/orgs/:orgId/invites — admit one or more people to a group.
 *
 * Body: { emails: string | string[], role?, vocation? }. Addresses may also arrive as one
 * pasted blob separated by commas, semicolons or whitespace, because that is how a list of
 * parishioners actually arrives.
 *
 * Responds `200` with `{ admitted, failed }` rather than `201`, and that is deliberate: a
 * batch is not one created resource, and partial success is the normal case. One bad
 * address must not cost the admin the other twenty-nine, so failures are reported per
 * address instead of failing the request. */
export const dynamic = "force-dynamic"

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { orgId } = await params
    const { emails, role, vocation } = await request.json()
    return sendResource(await inviteMembers(viewer, orgId, { emails, role, vocation }))
})

export const OPTIONS = preflight
