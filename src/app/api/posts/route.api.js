import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendCreated } from "@/lib/server/respond"
import { createPost } from "@/lib/server/posts.service"

/* POST /api/posts — publish a post into a group.
 *
 * Admin-only, and the check is `requireMembership(..., { role: "ADMIN" })` inside the
 * service rather than anything here: the route reads the request and nothing else. A
 * member who calls this gets 403; a non-member gets 404, so the endpoint cannot be used to
 * enumerate groups.
 *
 * Body: { orgId, title?, body, media?: [{ kind, url, width, height, mimeType, fileName,
 * sizeBytes }] }. Media is created with the post so it is never briefly visible without
 * its photos, and array order becomes carousel order. */
export const dynamic = "force-dynamic"

export const POST = route(async (request) => {
    const viewer = await requireViewer(request)
    const { orgId, title, body, media } = await request.json()
    const post = await createPost(viewer, { orgId, title, body, media })
    return sendCreated(post, `/api/posts/${post.id}`)
})

export const OPTIONS = preflight
