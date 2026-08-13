import { PAGE_SIZE } from "@/lib/constants"
import { pageParams, route } from "@/lib/server/handler"
import { sendCollection } from "@/lib/server/respond"
import { listFeed } from "@/lib/server/posts.service"

/* GET /api/feed?limit=&cursor= — one page of the dashboard feed.
 *
 * Filename note: `route.api.js`, not `route.js`. Route handlers are only registered in the
 * Node build; the native static export can't host them, so `pageExtensions` in
 * next.config.mjs makes this file invisible to it. See backend-architecture.md. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const { items, nextCursor } = await listFeed(
        pageParams(request, { fallback: PAGE_SIZE.FEED }),
    )
    return sendCollection(items, nextCursor)
})
