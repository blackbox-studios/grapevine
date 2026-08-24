import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { unreadCount } from "@/lib/server/notifications.service"

/* GET /api/notifications/unread — `{ unread }`, the number the bell's dot stands for.
 *
 * **A separate endpoint from the list, deliberately.** The two are asked at completely
 * different rates: the chrome needs this on every boot, while the list is only wanted when
 * somebody opens the panel. Folding the tally into the collection response would mean
 * loading and projecting a page of rows on every sign-in to decide whether to draw a dot,
 * and folding the list into this one would mean fetching it for readers who never look. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)
    return sendResource({ unread: await unreadCount(viewer) })
})

export const OPTIONS = preflight
