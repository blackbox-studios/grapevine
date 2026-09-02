import { requireViewer } from "@/lib/server/auth"
import { listFollowing } from "@/lib/server/follows.service"
import { pageParams, preflight, route } from "@/lib/server/handler"
import { sendCollection } from "@/lib/server/respond"
import { PAGE_SIZE } from "@/lib/constants"

/* GET /api/profiles/:handle/following — who this person follows, newest first.
 *
 * The mirror of `followers`, paging the other end of the same join. */
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { handle } = await params
    const { items, nextCursor } = await listFollowing(
        viewer,
        handle,
        pageParams(request, { fallback: PAGE_SIZE.FOLLOWS }),
    )
    return sendCollection(items, nextCursor)
})

export const OPTIONS = preflight
