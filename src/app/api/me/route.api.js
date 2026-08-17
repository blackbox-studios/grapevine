import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { getViewer } from "@/lib/server/profile.service"

/* GET /api/me — the signed-in viewer's profile and group memberships.
 *
 * The session probe. A Supabase token proves identity; this turns that into a viewer the
 * app knows — name, vocation, and the role that decides whether the composer appears.
 *
 * It is also what a static export needs in place of server rendering: with no server to
 * embed a bootstrapped user into the first paint, the client has to ask on boot. A 401
 * here is the definitive "this session is not usable", and the auth store signs out on
 * it rather than leaving a half-authenticated shell on screen. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)
    return sendResource(await getViewer(viewer))
})

export const OPTIONS = preflight
