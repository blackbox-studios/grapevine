import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { getPost } from "@/lib/server/posts.service"

/* GET /api/posts/:postId — one post's detail.
 *
 * This endpoint is why no post id has to be known at build time: the app resolves a post
 * when it is opened, not when it is compiled. See native-architecture.md → Dynamic routes
 * at scale.
 *
 * A post in a group the viewer was never approved into reports 404, not 403 — confirming
 * it exists would leak the contents of a parish they are not a member of. */
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { postId } = await params
    return sendResource(await getPost(viewer, postId))
})

export const OPTIONS = preflight
