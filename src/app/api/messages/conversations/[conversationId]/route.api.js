import { requireViewer } from "@/lib/server/auth"
import { pageParams, preflight, route } from "@/lib/server/handler"
import { deleteConversation, getConversation } from "@/lib/server/messages.service"
import { sendNoContent, sendResource } from "@/lib/server/respond"

/* GET    /api/messages/conversations/:id — the thread's meta and a page of its
 *        envelopes for `?deviceId=`, in one response; `?cursor=` pages older ones.
 * DELETE /api/messages/conversations/:id — discard the thread, offered on requests. */
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { conversationId } = await params
    const { limit, cursor, deviceId } = pageParams(request, {
        fallback: 50,
        extra: ["deviceId"],
    })
    return sendResource(
        await getConversation(viewer, conversationId, { deviceId, cursor, limit }),
    )
})

export const DELETE = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { conversationId } = await params
    await deleteConversation(viewer, conversationId)
    return sendNoContent()
})

export const OPTIONS = preflight
