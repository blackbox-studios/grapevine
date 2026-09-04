import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { addSlots } from "@/lib/server/signups.service"

/* POST /api/signups/:sheetId/slots — put more dates on a rota. Admin of its group.
 *
 * The same generator the sheet was created with, run again over a new range: a rota that has
 * run out of Sundays is extended rather than replaced, so the record of who did what survives
 * the extension.
 *
 * **Safe to repeat**, which is the property that makes it usable. `@@unique([sheetId,
 * startsAt])` plus `skipDuplicates` means an admin who taps Extend twice, or who picks a range
 * overlapping what is already there, gets the dates that were missing and nothing else. Without
 * it the second tap would put two coffee hours on every Sunday with no way to say which one
 * people had signed up for.
 *
 * It answers with the whole sheet rather than the slots it added, because that is what the
 * surface re-renders and because "which of these are new" is not a question the client has any
 * use for. */
export const dynamic = "force-dynamic"

export const POST = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { sheetId } = await params
    const body = await request.json()
    const sheet = await addSlots(viewer, sheetId, body)
    return sendResource(sheet)
})

export const OPTIONS = preflight
