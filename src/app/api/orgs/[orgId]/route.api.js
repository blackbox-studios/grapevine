import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { updateOrg } from "@/lib/server/profile.service"

/* PATCH /api/orgs/:orgId — the group's name, description and picture, for its admins.
 *
 * Admin-only: these fields are the parish's public face, so changing one is the same act as
 * publishing into it. A member gets 403; a non-member gets 404, because confirming that a
 * group exists to someone with no membership in it is the same leak the roster avoids.
 *
 * **There is deliberately no GET.** A viewer's groups already arrive with the viewer from
 * `/api/me`, complete with the role in each — a second endpoint serving the same row would
 * be a second copy to go stale, which is the exact reason the `org` store holds a selection
 * and not a collection. The edit screen reads the group from the viewer and PATCHes here.
 *
 * The response is the updated group in the same projection `/me` ships, so the store can
 * swap it into the viewer's list without a refetch. */
export const dynamic = "force-dynamic"

export const PATCH = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { orgId } = await params
    const body = await request.json()
    const org = await updateOrg(viewer, orgId, body)
    return sendResource(org)
})

export const OPTIONS = preflight
