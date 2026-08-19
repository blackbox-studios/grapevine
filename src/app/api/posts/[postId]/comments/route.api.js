import { PAGE_SIZE } from "@/lib/constants"
import { requireViewer } from "@/lib/server/auth"
import { pageParams, preflight, route } from "@/lib/server/handler"
import { sendCollection, sendCreated } from "@/lib/server/respond"
import { addComment, listComments } from "@/lib/server/posts.service"

/* GET  /api/posts/:postId/comments?limit=&cursor=  — one page of the thread
 * POST /api/posts/:postId/comments                 — post a comment as the viewer
 *
 * Commenting is the one write an ordinary member may perform; posting is admin-only and
 * lives at POST /api/posts. */
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { postId } = await params
    const { items, nextCursor } = await listComments(
        viewer,
        postId,
        pageParams(request, { fallback: PAGE_SIZE.COMMENTS }),
    )
    return sendCollection(items, nextCursor)
})

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { postId } = await params
    const { text } = await request.json()
    const comment = await addComment(viewer, postId, text)
    return sendCreated(comment, `/api/posts/${postId}/comments/${comment.id}`)
})

export const OPTIONS = preflight
