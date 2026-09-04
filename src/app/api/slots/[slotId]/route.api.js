import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendNoContent, sendResource } from "@/lib/server/respond"
import { deleteSlot, updateSlot } from "@/lib/server/signups.service"

/* PATCH  /api/slots/:slotId — one date's capacity, its note, or its cancellation.
 * DELETE /api/slots/:slotId — remove a date nobody has taken.
 *
 * Both are admin of the sheet's group, resolved two joins up (slot → sheet → org) and costing
 * no query, because the membership comes from the snapshot `requireViewer` already loaded.
 *
 * **Cancelling and deleting are not the same act, and the split is the volunteers'.** Deleting
 * a date somebody has signed up for would drop them without telling them anything, so it is
 * refused once there is anybody on it — the service points the admin at cancelling instead,
 * which keeps the row, tells everyone who was on it, and leaves the date visibly struck through
 * rather than vanished. That is the failure this pair exists to prevent: somebody turning up
 * for a soup kitchen that was called off a fortnight ago.
 *
 * PATCH answers with the updated slot so an optimistic client can reconcile; DELETE answers 204,
 * because there is no resulting state, only a row to drop. */
export const dynamic = "force-dynamic"

export const PATCH = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { slotId } = await params
    const body = await request.json()
    const slot = await updateSlot(viewer, slotId, body)
    return sendResource(slot)
})

export const DELETE = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { slotId } = await params
    await deleteSlot(viewer, slotId)
    return sendNoContent()
})

export const OPTIONS = preflight
