import { requireViewer } from "@/lib/server/auth"
import { listFollowers } from "@/lib/server/follows.service"
import { pageParams, preflight, route } from "@/lib/server/handler"
import { sendCollection } from "@/lib/server/respond"
import { PAGE_SIZE } from "@/lib/constants"

/* GET /api/profiles/:handle/followers — who follows this person, newest first.
 *
 * Shown whole rather than filtered to the people the *reader* also shares a group with, so the
 * list cannot disagree with the count above it. See the header of `follows.service.js`. */
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { handle } = await params
    const { items, nextCursor } = await listFollowers(
        viewer,
        handle,
        pageParams(request, { fallback: PAGE_SIZE.FOLLOWS }),
    )
    return sendCollection(items, nextCursor)
})

export const OPTIONS = preflight
