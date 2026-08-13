import { PAGE_SIZE } from "@/lib/constants"
import { pageParams, route } from "@/lib/server/handler"
import { sendCollection, sendCreated } from "@/lib/server/respond"
import { addComment, listComments } from "@/lib/server/posts.service"

/* GET  /api/posts/:postId/comments?limit=&cursor=  — one page of the thread
 * POST /api/posts/:postId/comments                 — post a comment as the viewer */
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const { postId } = await params
    const { items, nextCursor } = await listComments(
        postId,
        pageParams(request, { fallback: PAGE_SIZE.COMMENTS }),
    )
    return sendCollection(items, nextCursor)
})

export const POST = route(async (request, { params }) => {
    const { postId } = await params
    const { text } = await request.json()
    const comment = await addComment(postId, text)
    return sendCreated(comment, `/api/posts/${postId}/comments/${comment.id}`)
})
