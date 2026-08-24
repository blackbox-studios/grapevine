import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { createUpload } from "@/lib/server/uploads.service"

/* POST /api/uploads — permission to upload one file.
 *
 * Body: { purpose, orgId?, mimeType, sizeBytes? }. Answers `{ bucket, path, token, url }`: the
 * client sends the bytes straight to Supabase with `uploadToSignedUrl(path, token, file)` and
 * then hands `url` to whatever write the file was for.
 *
 * `sizeBytes` is what the caller says the file weighs — the bytes do not come through here, so
 * it cannot be verified. It is checked against the per-kind limit anyway (photos and
 * attachments have different ones); see the note in the service for what that does and does
 * not buy.
 *
 * **200, not 201.** Nothing has been created — this grants permission for a create that has
 * not happened yet, and may never. The object comes into existence at the client's upload,
 * which this API does not see. There is no `Location` for the same reason.
 *
 * Who may ask is decided per purpose inside the service: a post photo needs ADMIN of the
 * target group, an avatar needs only a session. */
export const dynamic = "force-dynamic"

export const POST = route(async (request) => {
    const viewer = await requireViewer(request)
    const { purpose, orgId, mimeType, sizeBytes } = await request.json()
    return sendResource(await createUpload(viewer, { purpose, orgId, mimeType, sizeBytes }))
})

export const OPTIONS = preflight
