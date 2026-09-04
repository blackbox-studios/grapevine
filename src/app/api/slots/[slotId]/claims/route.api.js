import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { claimSlot } from "@/lib/server/signups.service"

/* POST /api/slots/:slotId/claims — take a place on this date. Member of the group.
 *
 * **Not a toggle**, unlike a like, and the asymmetry is in the payloads rather than in taste:
 * taking a place carries who you are standing for and whether to remind you, and giving one up
 * carries nothing. One endpoint answering both would have to read a body to find out which act
 * it was performing. Releasing is `DELETE /api/claims/:claimId`.
 *
 * It answers with the **whole slot**, not the claim, for the reason the like endpoints answer
 * with `{ liked, likes }`: the client wrote optimistically and needs the authoritative result
 * to reconcile against, and what changed is the slot's occupancy rather than one row in it.
 *
 * A slot that filled up between the page being drawn and the button being pressed is a 409 and
 * not a 400 — nothing about the request was malformed, and the client's answer to it is to
 * re-read rather than to correct a field. Capacity is settled inside a locked transaction, so
 * two people taking the last place cannot both succeed. */
export const dynamic = "force-dynamic"

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { slotId } = await params
    const body = await request.json().catch(() => ({}))
    const slot = await claimSlot(viewer, slotId, body)
    return sendResource(slot)
})

export const OPTIONS = preflight
