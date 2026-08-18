import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { completeOnboarding } from "@/lib/server/profile.service"

/* POST /api/me/onboarding — finish first-run orientation.
 *
 * Returns the whole updated viewer rather than 204, so the client can replace its copy in
 * one step. That matters here: `onboardedAt` is what the welcome gate reads, and a client
 * that had to re-fetch to learn it would sit on the orientation screen a beat longer than
 * necessary — or, if the re-fetch failed, forever. */
export const dynamic = "force-dynamic"

export const POST = route(async (request) => {
    const viewer = await requireViewer(request)
    const { birthday } = await request.json()
    return sendResource(await completeOnboarding(viewer, { birthday }))
})

export const OPTIONS = preflight
