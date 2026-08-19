import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { toggleCommentLike } from "@/lib/server/posts.service"

/* POST /api/comments/:commentId/likes — toggles the viewer's like on a comment. */
export const dynamic = "force-dynamic"

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { commentId } = await params
    return sendResource(await toggleCommentLike(viewer, commentId))
})

export const OPTIONS = preflight
