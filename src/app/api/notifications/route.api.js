import { PAGE_SIZE } from "@/lib/constants"
import { requireViewer } from "@/lib/server/auth"
import { pageParams, preflight, route } from "@/lib/server/handler"
import { sendCollection } from "@/lib/server/respond"
import { listNotifications } from "@/lib/server/notifications.service"

/* GET /api/notifications?limit=&cursor= — one page of the viewer's notifications.
 *
 * Addressed to a person, not to a group, so there is no `orgId` filter here and there
 * should not be one: a like on something you wrote in a parish you have since stopped
 * reading is still a thing that happened to you. The viewer is the entire scope, and it is
 * the one scope a caller cannot widen.
 *
 * Filename note: `route.api.js`, not `route.js` — see backend-architecture.md. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)
    const { items, nextCursor } = await listNotifications(
        viewer,
        pageParams(request, { fallback: PAGE_SIZE.NOTIFICATIONS }),
    )
    return sendCollection(items, nextCursor)
})

export const OPTIONS = preflight
