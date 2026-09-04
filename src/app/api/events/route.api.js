import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { listCalendar } from "@/lib/server/calendar.service"

/* GET /api/events?orgId=&from=&to= — the compiled calendar for one group and one window.
 *
 * **One endpoint for two sources**, and that is the whole reason it exists. The month grid
 * cannot draw a single square until it knows both what the parish has on that day and which
 * sign-up slots fall on it, so two endpoints would mean two skeletons and a grid that fills in
 * twice. The service fetches the parish's iCalendar feed and queries the slots in parallel and
 * hands back one sorted list, discriminated by `kind`.
 *
 * `orgId` is **required**, unlike the feed's optional narrowing. A calendar belongs to a group
 * — a union across a viewer's parishes would put a diocese's Vespers and a parish's coffee
 * hour on the same square with nothing to tell them apart — and `requireMembership` inside the
 * service is what keeps it a group the viewer is actually in.
 *
 * It answers with a **resource, not a collection**, and that is deliberate rather than sloppy:
 * the body carries `hasCalendar` beside `items`, because the surface has to tell "nothing is
 * on this month" apart from "this group has no calendar", and those are two empty screens that
 * want completely different words. `items` still carries a `nextCursor` of null inside the
 * same object, so a caller that treats it as a collection is not surprised. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)
    const params = new URL(request.url).searchParams

    const calendar = await listCalendar(viewer, {
        orgId: params.get("orgId"),
        from: params.get("from"),
        to: params.get("to"),
    })

    return sendResource(calendar)
})

export const OPTIONS = preflight
