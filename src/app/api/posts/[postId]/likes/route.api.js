import { route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { togglePostLike } from "@/lib/server/posts.service"

/* POST /api/posts/:postId/likes — toggles the viewer's like.
 *
 * A toggle rather than a PUT/DELETE pair because the client only ever knows "the viewer
 * tapped the heart", and it responds with the authoritative `{ liked, likes }` so the
 * optimistic update can be reconciled without re-fetching the post. */
export const dynamic = "force-dynamic"

export const POST = route(async (_request, { params }) => {
    const { postId } = await params
    return sendResource(await togglePostLike(postId))
})
