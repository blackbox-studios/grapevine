import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { getViewer, updateAvatar } from "@/lib/server/profile.service"

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

/* PATCH /api/me — replaces the viewer's profile picture.
 *
 * A PATCH of the viewer rather than a `/me/avatar` sub-resource, because the picture is a
 * field of this resource and the response is the whole updated viewer — which is what the
 * auth store swaps in, so the name in the nav and the face on every one of the viewer's own
 * comments move together with one round trip.
 *
 * Deliberately narrow: only `avatar`. Everything else about a profile is set during
 * orientation, and a general editor is a different endpoint with different validation rather
 * than more branches in this one. */
export const PATCH = route(async (request) => {
    const viewer = await requireViewer(request)
    const { avatar } = await request.json()
    return sendResource(await updateAvatar(viewer, avatar))
})

export const OPTIONS = preflight
