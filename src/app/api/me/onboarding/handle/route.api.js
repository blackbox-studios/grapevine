import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { checkHandle } from "@/lib/server/profile.service"

/* GET /api/me/onboarding/handle?value=… — is this @handle free?
 *
 * Exists so a collision surfaces on the step that caused it. The handle is chosen in the
 * middle of orientation, so leaving uniqueness to the final POST would mean discovering the
 * problem after the last question and throwing the viewer back two screens to fix it.
 *
 * **Advisory only.** Someone can take the handle in the seconds between this answer and the
 * write; the unique constraint in `completeOnboarding` is what actually decides, and it
 * reports a `handle` field error the form knows how to route back to this step.
 *
 * A 200 with `{ available: false }` rather than a 409 — an unavailable handle is a fact the
 * caller asked for, not a failed request. Behind `requireViewer` like every other endpoint;
 * see `checkHandle` on why enumeration is not a concern for values that are public the
 * moment their owner comments. */
export const dynamic = "force-dynamic"

export const GET = route(async (request) => {
    const viewer = await requireViewer(request)
    const value = new URL(request.url).searchParams.get("value")
    return sendResource(await checkHandle(viewer, value))
})

export const OPTIONS = preflight
