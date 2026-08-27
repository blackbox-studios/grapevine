import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendNoContent, sendResource } from "@/lib/server/respond"
import { deleteOrg, updateOrg } from "@/lib/server/orgs.service"

/* PATCH /api/orgs/:orgId — the group's name, description and picture, for its admins.
 * DELETE /api/orgs/:orgId — destroy the group, for the platform owner who created it.
 *
 * The two verbs answer to different authorities and that asymmetry is the point. PATCH is
 * admin-of-this-group: those fields are the parish's public face, so changing one is the same
 * act as publishing into it. DELETE is owner-who-created-it, which is narrower than either
 * admin or owner — a parish priest administering his own parish must not be able to delete the
 * group the subscriber pays for, and one subscriber must never reach another's. See
 * `deleteOrg`, which also requires the group's slug echoed in the body as confirmation.
 *
 * A member gets 403 on PATCH; a non-member gets 404, because confirming that a group exists to
 * someone with no membership in it is the same leak the roster avoids. DELETE follows the same
 * shape for the same reason.
 *
 * **There is deliberately no GET.** A viewer's groups already arrive with the viewer from
 * `/api/me`, complete with the role in each — a second endpoint serving the same row would
 * be a second copy to go stale, which is the exact reason the `org` store holds a selection
 * and not a collection. The edit screen reads the group from the viewer and PATCHes here.
 *
 * PATCH answers with the updated group in the same projection `/me` ships, so the store can
 * swap it in without a refetch. DELETE answers 204: there is no resulting state to reconcile,
 * only a row for the client to drop. */
export const dynamic = "force-dynamic"

export const PATCH = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { orgId } = await params
    const body = await request.json()
    const org = await updateOrg(viewer, orgId, body)
    return sendResource(org)
})

export const DELETE = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { orgId } = await params
    /* A DELETE with a body is unusual but correct here — the confirmation is a value the
     * caller must produce, and putting it in the query string would leave a parish's slug in
     * access logs and browser history as part of the request that destroyed it. Tolerant of
     * an absent body so a request with no payload fails the confirmation check with its
     * message rather than a JSON parse error. */
    const body = await request.json().catch(() => ({}))
    await deleteOrg(viewer, orgId, body)
    return sendNoContent()
})

export const OPTIONS = preflight
