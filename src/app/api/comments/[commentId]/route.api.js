import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendNoContent } from "@/lib/server/respond"
import { deleteComment } from "@/lib/server/posts.service"

/* DELETE /api/comments/:commentId — the author removes their own comment, or an admin of
 * the post's group removes anyone's. 204: there is nothing left to return. */
export const dynamic = "force-dynamic"

export const DELETE = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { commentId } = await params
    await deleteComment(viewer, commentId)
    return sendNoContent()
})

export const OPTIONS = preflight
