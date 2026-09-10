import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { markConversationRead } from "@/lib/server/messages.service"
import { sendNoContent } from "@/lib/server/respond"

/* POST /api/messages/conversations/:id/read — move this viewer's read cursor to now.
 * A write endpoint with no body: the fact is "seen as of this request". */
export const dynamic = "force-dynamic"

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { conversationId } = await params
    await markConversationRead(viewer, conversationId)
    return sendNoContent()
})

export const OPTIONS = preflight
