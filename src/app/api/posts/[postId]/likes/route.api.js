import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { togglePostLike } from "@/lib/server/posts.service"

/* POST /api/posts/:postId/likes — toggles the viewer's like.
 *
 * A toggle rather than a PUT/DELETE pair because the client only ever knows "the viewer
 * tapped the heart", and it responds with the authoritative `{ liked, likes }` so the
 * optimistic update can be reconciled without re-fetching the post. */
export const dynamic = "force-dynamic"

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { postId } = await params
    return sendResource(await togglePostLike(viewer, postId))
})

export const OPTIONS = preflight
