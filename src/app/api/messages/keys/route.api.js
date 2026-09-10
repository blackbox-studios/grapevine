import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { registerCryptoDevice } from "@/lib/server/messages.service"
import { sendResource } from "@/lib/server/respond"

/* POST /api/messages/keys — register (or refresh) this installation's public key
 * bundle: identity key, signed prekey, and the one-time prekey pool. Everything in the
 * body is public material; the private halves never leave the device. Called on boot by
 * every adult viewer, so a parishioner is reachable over E2EE before they ever open the
 * messages surface themselves. */
export const dynamic = "force-dynamic"

export const POST = route(async (request) => {
    const viewer = await requireViewer(request)
    const payload = await request.json().catch(() => null)
    return sendResource(await registerCryptoDevice(viewer, payload))
})

export const OPTIONS = preflight
