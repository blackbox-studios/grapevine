"use client"

import { ProtectedGate } from "@/components/AuthGate"
import { GatewayRedirect } from "@/components/MemberGate"

/* The route group for screens that sit between signing in and being in the app: first-run
 * orientation and the access-removed notice.
 *
 * Its own group, not part of `(protected)`, because these screens must NOT wear the app
 * shell. Rendering the nav rail around "your access has been removed" would offer a
 * Home tab to someone with no home to go to.
 *
 * Still behind <ProtectedGate/> — you have to be signed in to be told either of these
 * things. <GatewayRedirect/> is the mirror of the gate in the protected layout: it sends a
 * viewer who no longer belongs here back into the app. */
const GatewayLayout = ({ children }) => (
    <ProtectedGate>
        <GatewayRedirect>{children}</GatewayRedirect>
    </ProtectedGate>
)

export default GatewayLayout
