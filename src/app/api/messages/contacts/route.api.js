import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { listContacts } from "@/lib/server/messages.service"
import { sendCollection } from "@/lib/server/respond"

/* GET /api/messages/contacts?query= — who the viewer may start a thread with: every
 * adult they share an APPROVED group with who has a registered device. Not a
 * directory: the shared-group scope is the same boundary every profile read has, and
 * minors are absent rather than filtered client-side. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)
    const query = new URL(request.url).searchParams.get("query")
    const { items, nextCursor } = await listContacts(viewer, { query })
    return sendCollection(items, nextCursor)
})

export const OPTIONS = preflight
