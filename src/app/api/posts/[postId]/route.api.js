import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { getPost } from "@/lib/server/posts.service"

/* GET /api/posts/:postId — one post's detail.
 *
 * This endpoint is why no post id has to be known at build time: the app resolves a post
 * when it is opened, not when it is compiled. See native-architecture.md → Dynamic routes
 * at scale. */
export const dynamic = "force-dynamic"

export const GET = route(async (_request, { params }) => {
    const { postId } = await params
    return sendResource(await getPost(postId))
})

export const OPTIONS = preflight
