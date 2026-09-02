import { requireViewer } from "@/lib/server/auth"
import { getProfile } from "@/lib/server/follows.service"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"

/* GET /api/profiles/:handle — somebody else's profile.
 *
 * Keyed by @handle rather than by id, because the handle is what the reader tapped and what
 * `/u/:handle` carries. It is unique and indexed, so this costs the same lookup an id would.
 *
 * **Not a directory.** `visibleProfile` answers 404 for anybody the viewer shares no APPROVED
 * group with, so a handle alone is never enough to confirm that an account exists — see the
 * header of `follows.service.js`. */
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { handle } = await params
    return sendResource(await getProfile(viewer, handle))
})

export const OPTIONS = preflight
