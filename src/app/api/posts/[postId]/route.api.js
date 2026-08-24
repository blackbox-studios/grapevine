import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendNoContent, sendResource } from "@/lib/server/respond"
import { deletePost, getPost } from "@/lib/server/posts.service"

/* GET /api/posts/:postId — one post's detail.
 * DELETE /api/posts/:postId — remove it (admin of the post's group only).
 *
 * GET is why no post id has to be known at build time: the app resolves a post when it is
 * opened, not when it is compiled. See native-architecture.md → Dynamic routes at scale.
 *
 * A post in a group the viewer was never approved into reports 404 on either verb, not 403 —
 * confirming it exists would leak the contents of a parish they are not a member of. A member
 * of that group who is not an admin gets 403, since they already know it exists. */
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { postId } = await params
    return sendResource(await getPost(viewer, postId))
})

export const DELETE = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { postId } = await params
    await deletePost(viewer, postId)
    return sendNoContent()
})

export const OPTIONS = preflight
