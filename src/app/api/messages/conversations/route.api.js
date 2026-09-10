import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { listConversations, openConversation } from "@/lib/server/messages.service"
import { sendCollection, sendResource } from "@/lib/server/respond"

/* GET  /api/messages/conversations — the inbox, newest-moving thread first.
 *      `?deviceId=` is which install is asking, so each row's newest envelope for that
 *      device rides along and the list can show decrypted snippets without a request
 *      per row.
 * POST /api/messages/conversations — open (or find) the 1:1 thread with
 *      `{ profileId }`. Idempotent on the pair. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)
    const deviceId = new URL(request.url).searchParams.get("deviceId")
    const { items, nextCursor } = await listConversations(viewer, { deviceId })
    return sendCollection(items, nextCursor)
})

export const POST = route(async (request) => {
    const viewer = await requireViewer(request)
    const { profileId } = await request.json().catch(() => ({}))
    return sendResource(await openConversation(viewer, { profileId }))
})

export const OPTIONS = preflight
