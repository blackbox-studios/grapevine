import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { addSlots } from "@/lib/server/signups.service"

/* POST /api/signups/:sheetId/slots — put more dates on a rota. Admin of its group.
 *
 * Repeatable, for the reason `addSlots` carries.
 *
 * It answers with the whole sheet rather than the slots it added, because that is what the
 * surface re-renders and because "which of these are new" is not a question the client has any
 * use for. */
export const dynamic = "force-dynamic"

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { sheetId } = await params
    const body = await request.json()
    const sheet = await addSlots(viewer, sheetId, body)
    return sendResource(sheet)
})

export const OPTIONS = preflight
