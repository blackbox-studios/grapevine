import { API_ENDPOINTS, PAGE_SIZE } from "@/lib/constants"
import { requireViewer } from "@/lib/server/auth"
import { pageParams, preflight, route } from "@/lib/server/handler"
import { sendCollection, sendCreated } from "@/lib/server/respond"
import { createSheet, listSheets } from "@/lib/server/signups.service"

/* GET  /api/signups?orgId=&limit=&cursor= — a group's sign-up sheets.
 * POST /api/signups                       — publish one. Admin of the group.
 *
 * The two verbs answer to the two authorities this app already had, and to no third one:
 * reading a rota is being in the parish, publishing one is administering it. Exactly the split
 * between reading the feed and posting into it, for the same reason — a rota is the parish
 * asking for hands, not a member offering them.
 *
 * `orgId` is required on the GET. Sheets are group-scoped like posts, and there is no unscoped
 * variant of this endpoint any more than there is one of the roster.
 *
 * **Each sheet arrives with its dates**, which is what lets a row open without a request — see
 * `listSheets`. It is also what makes "what have I signed up for" a question the client answers
 * for itself, out of rotas it is already holding, rather than a second collection on this
 * response. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)
    const { items, nextCursor } = await listSheets(
        viewer,
        pageParams(request, { fallback: PAGE_SIZE.SIGNUPS, extra: ["orgId"] }),
    )
    return sendCollection(items, nextCursor)
})

export const POST = route(async (request) => {
    const viewer = await requireViewer(request)
    const body = await request.json()
    const sheet = await createSheet(viewer, body)
    return sendCreated(sheet, API_ENDPOINTS.SIGNUP(sheet.id))
})

export const OPTIONS = preflight
