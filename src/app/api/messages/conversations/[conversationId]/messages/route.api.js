import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendMessage } from "@/lib/server/messages.service"
import { sendCreated } from "@/lib/server/respond"

/* POST /api/messages/conversations/:id/messages — relay one message:
 * `{ senderDeviceId, envelopes: [{ deviceId, type, body }] }`, one envelope per
 * recipient device, all ciphertext. The server checks the social rules (shared group,
 * blocks, the request gate) and the addressing; it cannot and does not check the
 * content. */
export const dynamic = "force-dynamic"

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { conversationId } = await params
    const body = await request.json().catch(() => ({}))
    return sendCreated(await sendMessage(viewer, conversationId, body))
})

export const OPTIONS = preflight
