import { requireViewer } from "@/lib/server/auth"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"
import { completeOnboarding } from "@/lib/server/profile.service"

/* POST /api/me/onboarding — finish first-run orientation.
 *
 * Takes all of it at once, every question the flow asked, even though the screen asks them in
 * steps. The steps are a client-side presentation of one decision; a partial POST per step
 * would make "half-onboarded" a real state in the database, and there is no screen that
 * repairs one. See `completeOnboarding`.
 *
 * **Forwarded whole rather than picked apart**, the way `PATCH /api/me` is. A destructure here
 * is a second, silent list of which fields orientation may answer, and a step added to the
 * flow whose field is missing from it fails in the way that is hardest to see: the form
 * submits, the viewer is let into the app, and the answer is simply not there. `completeOnboarding`
 * validates every field it reads and ignores everything else, which is the list that should
 * decide.
 *
 * Returns the whole updated viewer rather than 204, so the client can replace its copy in
 * one step. That matters here: `onboardedAt` is what the welcome gate reads, and a client
 * that had to re-fetch to learn it would sit on the orientation screen a beat longer than
 * necessary — or, if the re-fetch failed, forever. */
export const dynamic = "force-dynamic"

export const POST = route(async (request) => {
    const viewer = await requireViewer(request)
    return sendResource(await completeOnboarding(viewer, await request.json()))
})

export const OPTIONS = preflight
