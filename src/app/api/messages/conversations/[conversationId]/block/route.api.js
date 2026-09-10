import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { blockConversation } from "@/lib/server/messages.service"
import { sendNoContent } from "@/lib/server/respond"

/* POST /api/messages/conversations/:id/block — refuse the other participant for good
 * and discard the thread. The blocked party is never told; their next send fails with
 * the same generic refusal a lapsed shared membership earns. */
export const dynamic = "force-dynamic"

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { conversationId } = await params
    await blockConversation(viewer, conversationId)
    return sendNoContent()
})

export const OPTIONS = preflight
