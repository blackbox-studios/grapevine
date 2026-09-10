import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { acceptConversation } from "@/lib/server/messages.service"
import { sendNoContent } from "@/lib/server/respond"

/* POST /api/messages/conversations/:id/accept — the request gate opens: the viewer may
 * reply from here on, and their inbox row stops rendering blurred. Idempotent. */
export const dynamic = "force-dynamic"

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { conversationId } = await params
    await acceptConversation(viewer, conversationId)
    return sendNoContent()
})

export const OPTIONS = preflight
