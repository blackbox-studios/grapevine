import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendCollection, sendCreated } from "@/lib/server/respond"
import { createOrg, listOrgs } from "@/lib/server/orgs.service"

/* GET /api/orgs — the groups the viewer belongs to, with their role and approval status
 * in each.
 * POST /api/orgs — create a group. Platform owners only.
 *
 * GET is deliberately not a directory of every group in the system. Listing parishes a viewer
 * has no membership in would undo the same privacy boundary the 404-over-403 rule protects
 * elsewhere — and it stays that way for owners too, who see the groups they are in and not the
 * ones they merely could have created. An owner console needs its own endpoint, gated
 * separately, rather than a second meaning behind this one.
 *
 * POST is the only action in the app not scoped to a group, because the group does not exist
 * yet; `requirePlatformOwner` inside `createOrg` is the whole gate. It answers 201 with the
 * new group in the same projection GET ships, already carrying the creator's ADMIN membership,
 * so a client can drop it straight into the switcher. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)
    const { items, nextCursor } = await listOrgs(viewer)
    return sendCollection(items, nextCursor)
})

export const POST = route(async (request) => {
    const viewer = await requireViewer(request)
    const body = await request.json()
    const org = await createOrg(viewer, body)
    return sendCreated(org, `/api/orgs/${org.id}`)
})

export const OPTIONS = preflight
