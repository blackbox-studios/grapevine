import { requireViewer } from "@/lib/server/auth"
import { toggleFollow } from "@/lib/server/follows.service"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"

/* POST /api/profiles/:handle/follow — toggles the viewer's follow.
 *
 * A toggle rather than a POST/DELETE pair, and a `{ following, followers }` body rather than a
 * 204, for the reasons the like endpoints are shaped that way: the client only ever knows "the
 * reader tapped the button", and an optimistic update needs the authoritative result to
 * reconcile against. */
export const dynamic = "force-dynamic"

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { handle } = await params
    return sendResource(await toggleFollow(viewer, handle))
})

export const OPTIONS = preflight
