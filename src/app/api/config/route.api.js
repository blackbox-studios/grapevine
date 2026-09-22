import { appConfig } from "@/lib/server/config"
import { preflight, route } from "@/lib/server/handler"
import { sendResource } from "@/lib/server/respond"

/* GET /api/config — the app's feature flags: `{ messagingEnabled, minimumVersion }`.
 *
 * **The one unauthenticated route in this tree, and the reason is what it is for.** The flags
 * it carries include the version floor, which exists precisely for a build old enough to be
 * incompatible with this server — a kill switch that can only be read by a client still able to
 * authenticate is a kill switch that cannot be reached in the case it was written for. So this
 * asks for nothing, and answers the same two values to everybody.
 *
 * That is only acceptable because of what is on it: a boolean saying whether messaging is on,
 * and a version number. Neither names a person or a parish, and both are already inferable from
 * the app's own behaviour. **Nothing viewer-scoped may be added here** — a flag that varies by
 * who is asking belongs on `/api/me`, which has a viewer to vary by.
 *
 * Cheap enough to be asked on every boot: `appConfig` holds the answer for minutes at a time,
 * so all but one request in each lease is a comparison against a timestamp.
 *
 * Filename note: `route.api.js`, not `route.js` — see backend-architecture.md. */
export const dynamic = "force-dynamic"

export const GET = route(async () => sendResource(await appConfig()))

export const OPTIONS = preflight
