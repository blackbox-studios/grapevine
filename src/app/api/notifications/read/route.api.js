import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { markNotificationsRead } from "@/lib/server/notifications.service"

/* POST /api/notifications/read — marks the viewer's notifications read.
 *
 * A named action rather than a PATCH of each resource, for the same reason the like
 * endpoints are a POST toggle: the client only ever knows "they opened the panel", and
 * turning that into a request per unread row would be a round trip per line.
 *
 * It answers the resulting `{ unread }` rather than 204 so the optimistic client has an
 * authoritative value to reconcile the badge against — the rule from backend-architecture.md
 * §5 that a mutation returns the state it produced. */
export const dynamic = "force-dynamic"

export const POST = route(async (request) => {
    const viewer = await requireViewer(request)
    return sendResource(await markNotificationsRead(viewer))
})

export const OPTIONS = preflight
