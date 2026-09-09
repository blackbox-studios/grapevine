import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { getFastingRule } from "@/lib/server/prologue.service"

/* GET /api/fasting?date=YYYY-MM-DD — what the Church keeps on one day.
 *
 * The almanac half of `/api/prologue`, on its own. A sign-up sheet with `showFasting` asks this
 * for the date somebody is about to take, and warms the dates around it; asking `/api/prologue`
 * instead would fetch a day of the Prologue's text per date to render one sentence.
 *
 * Group-less like the reading it was split from, for the same reason: a fast is the same fact in
 * every parish. It still asks for a viewer, because it reaches a service outside this app on the
 * caller's behalf and an open route would make this server an anonymous proxy for it.
 *
 * Filename note: `route.api.js`, not `route.js` — see backend-architecture.md. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    await requireViewer(request)
    const date = new URL(request.url).searchParams.get("date")
    return sendResource(await getFastingRule(date))
})

export const OPTIONS = preflight
