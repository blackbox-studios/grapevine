import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { getViewer, updateProfile } from "@/lib/server/profile.service"

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

/* PATCH /api/me — edits the viewer's own profile.
 *
 * A PATCH of the viewer rather than a tree of `/me/avatar`-style sub-resources, because these
 * are fields of this resource and the response is the whole updated viewer — which is what the
 * auth store swaps in, so the name in the nav and the face on every one of the viewer's own
 * comments move together with one round trip.
 *
 * Genuinely partial: the body is forwarded as it arrived, and `updateProfile` writes only the
 * keys it was given. That is what lets the avatar picker send one field and the settings form
 * send three without either clearing the other's. */
export const PATCH = route(async (request) => {
    const viewer = await requireViewer(request)
    return sendResource(await updateProfile(viewer, await request.json()))
})

export const OPTIONS = preflight
