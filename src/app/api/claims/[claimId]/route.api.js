import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { releaseClaim } from "@/lib/server/signups.service"

/* DELETE /api/claims/:claimId — give up a place on a rota.
 *
 * **Authorized on two rules that are deliberately not merged**, exactly as deleting a comment
 * is: a person owns what they signed up for, and an admin manages the rota they published. The
 * second is per-group, resolved from the membership that authorized reading the sheet, so
 * administering a diocese grants nothing over a parish's coffee hour. The slot projection ships
 * the composed answer as `canRemove` on each claim, so a row never offers a button that would
 * then 403.
 *
 * It answers **200 with the slot** rather than 204, which is the one place this diverges from
 * every other delete in the app. The reason is what the caller does next: releasing a place
 * changes the slot's occupancy, and a 204 would leave the client to guess at the new numbers or
 * re-read the sheet to find them. It is the same argument the like toggles make — a mutation
 * returns the resulting state. */
export const dynamic = "force-dynamic"

export const DELETE = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { claimId } = await params
    const slot = await releaseClaim(viewer, claimId)
    return sendResource(slot)
})

export const OPTIONS = preflight
