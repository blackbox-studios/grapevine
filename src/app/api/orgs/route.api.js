import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendCollection } from "@/lib/server/respond"
import { listOrgs } from "@/lib/server/profile.service"

/* GET /api/orgs — the groups the viewer belongs to, with their role and approval status
 * in each.
 *
 * Deliberately not a directory of every group in the system. Listing parishes a viewer has
 * no membership in would undo the same privacy boundary the 404-over-403 rule protects
 * elsewhere; a join-request flow, when it exists, needs its own explicitly-scoped
 * endpoint. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)
    const { items, nextCursor } = await listOrgs(viewer)
    return sendCollection(items, nextCursor)
})

export const OPTIONS = preflight
