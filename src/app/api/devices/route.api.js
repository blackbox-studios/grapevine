import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendNoContent, sendResource } from "@/lib/server/respond"
import { registerDevice, unregisterDevice } from "@/lib/server/devices.service"

/* POST   /api/devices — this installation may be pushed to, as this viewer
 * DELETE /api/devices — it may not any more (sign-out)
 *
 * **A collection with no GET.** Nothing in the app lists somebody's devices, and an endpoint
 * that answered with a viewer's FCM tokens would hand out the exact values needed to
 * impersonate their handsets to Firebase. The two writes are the whole surface.
 *
 * **The token travels in the body on DELETE, not in the path.** An FCM registration token is
 * a couple of hundred characters of opaque base64url and would be an unwieldy path segment,
 * but the real reason is that a path segment lands in access logs and proxy caches by
 * default — and this one is a credential for delivering to somebody's phone. A body does not.
 *
 * Not group-scoped, and it must not be: a device belongs to a *person*, who may read several
 * parishes on it, so there is no `orgId` here and no `requireMembership`. `requireViewer` is
 * the entire authorization story, exactly as it is for the notifications endpoints. */
export const dynamic = "force-dynamic"

export const POST = route(async (request) => {
    const viewer = await requireViewer(request)
    const { token, platform } = await request.json()
    return sendResource(await registerDevice(viewer, { token, platform }))
})

export const DELETE = route(async (request) => {
    const viewer = await requireViewer(request)
    /* Sign-out fires this on its way out and cannot be blocked by a malformed body, so a
     * missing one degrades to "no token supplied" — which the service rejects as a 400
     * rather than throwing a parse error into a 500. */
    const { token } = await request.json().catch(() => ({}))
    await unregisterDevice(viewer, token)
    return sendNoContent()
})

export const OPTIONS = preflight
