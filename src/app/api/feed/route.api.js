import { PAGE_SIZE } from "@/lib/constants"
import { requireViewer } from "@/lib/server/auth"
import { pageParams, preflight, route } from "@/lib/server/handler"
import { sendCollection } from "@/lib/server/respond"
import { listFeed } from "@/lib/server/posts.service"

/* GET /api/feed?limit=&cursor=&orgId= — one page of the viewer's feed.
 *
 * The feed is per-viewer: it is the union of the organizations they hold an APPROVED
 * membership in, resolved inside the service. There is no unscoped variant of this
 * endpoint, and there must not be one.
 *
 * `orgId` narrows that union to the one group the switcher has selected. It is an
 * *optional* filter over the viewer's own scope rather than a widening of it — the service
 * runs `requireMembership` on it, so it can only ever subtract from what the viewer could
 * already read.
 *
 * Filename note: `route.api.js`, not `route.js`. Route handlers are only registered in the
 * Node build; the native static export can't host them, so `pageExtensions` in
 * next.config.mjs makes this file invisible to it. See backend-architecture.md. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)
    const { items, nextCursor } = await listFeed(viewer, {
        ...pageParams(request, { fallback: PAGE_SIZE.FEED }),
        orgId: new URL(request.url).searchParams.get("orgId"),
    })
    return sendCollection(items, nextCursor)
})

export const OPTIONS = preflight
