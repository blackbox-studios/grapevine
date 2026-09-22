import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { getDailyReading } from "@/lib/server/prologue.service"

/* GET /api/prologue?date=YYYY-MM-DD&translation=<version> — the Daily Read, defaulting to
 * today in the default translation.
 *
 * The one endpoint here with no group in it. A day's reading is the same text for every
 * parish, so there is nothing to scope and no `orgId` to filter on — but it still asks for
 * a viewer, because it reaches two services outside this app on the caller's behalf and an
 * open route would make this server an anonymous proxy for both of them.
 *
 * Filename note: `route.api.js`, not `route.js` — see backend-architecture.md. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    await requireViewer(request)
    const params = new URL(request.url).searchParams
    return sendResource(
        await getDailyReading(params.get("date"), params.get("translation")),
    )
})

export const OPTIONS = preflight
