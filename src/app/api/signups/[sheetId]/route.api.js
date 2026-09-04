import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendNoContent, sendResource } from "@/lib/server/respond"
import { deleteSheet, getSheet, updateSheet } from "@/lib/server/signups.service"

/* GET    /api/signups/:sheetId — one rota, its dates, and who is on them.
 * PATCH  /api/signups/:sheetId — its title, description, or whether it is still taking people.
 * DELETE /api/signups/:sheetId — retire it. Soft, like a post.
 *
 * `?all=1` on the GET asks for every date rather than the fortnight-and-forward window the
 * read defaults to. It exists for the manage surface, where an admin is editing a rota's
 * history rather than signing up for its future, and it is not a permission — a member may ask
 * for it too and simply gets a longer list of dates they can no longer take.
 *
 * **Closing and deleting are different acts and both are offered.** A rota that has finished is
 * closed, which keeps it readable: who brought the food in Lent is most of what a parish keeps
 * a sheet for. Deleting is for a sheet that should never have been published, and it is soft,
 * so the record of who volunteered survives a mis-tap. */
export const dynamic = "force-dynamic"

export const GET = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { sheetId } = await params
    const all = new URL(request.url).searchParams.get("all") === "1"
    const sheet = await getSheet(viewer, sheetId, { all })
    return sendResource(sheet)
})

export const PATCH = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { sheetId } = await params
    const body = await request.json()
    const sheet = await updateSheet(viewer, sheetId, body)
    return sendResource(sheet)
})

export const DELETE = route(async (request, { params }) => {
    const viewer = await requireViewer(request)
    const { sheetId } = await params
    await deleteSheet(viewer, sheetId)
    return sendNoContent()
})

export const OPTIONS = preflight
