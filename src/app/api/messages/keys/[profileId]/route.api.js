import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { bundlesFor } from "@/lib/server/messages.service"
import { sendResource } from "@/lib/server/respond"

/* GET /api/messages/keys/:profileId — a prekey bundle for each of that person's
 * devices, consuming one one-time prekey per device. Scoped exactly as a profile read
 * is (one shared APPROVED group), plus the messaging gates: both parties adults, no
 * block. `?exclude=` names the asker's own device for the self case; `?devices=` (a
 * comma-separated id list) narrows to the sessionless ones, so keys are only consumed
 * for devices the sender cannot already reach. */
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { profileId } = await params
    const search = new URL(request.url).searchParams
    const exclude = search.get("exclude")
    const only = search.get("devices")?.split(",").filter(Boolean) ?? null
    return sendResource(await bundlesFor(viewer, profileId, { exclude, only }))
})

export const OPTIONS = preflight
