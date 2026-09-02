"use client"

import PageTransition from "@/components/PageTransition"
import { PrivilegedRoute } from "@/components/Auth"
import { ROLES, ROUTES } from "@/lib/constants"
import { useCurrentOrg } from "@/lib/store/org/hook"

/* The shared frame around the group tree, and the one place it is gated.
 *
 * **Every page here answers the same question**, so it is asked once: a gate per page is a gate
 * somebody forgets on the next page. `<PrivilegedRoute>` redirects rather than hiding, because
 * these are routes — a member who lands on one by a stale link or by being demoted mid-session
 * should be moved, not shown an empty frame. `orgId` comes from the switcher's selection;
 * omitting it falls back to the viewer's first membership, which would let an admin of one
 * parish open another's settings.
 *
 * The nested <PageTransition/> mirrors the account tree's, and `/group` is in
 * NESTED_TRANSITION_ROUTES with it, so these pages cross-fade against a frame that does not
 * move. `min-w-0` is what lets the roster — a wide table — resolve to this column's width and
 * scroll sideways inside itself rather than forcing the column past the viewport. */

const GroupLayout = ({ children }) => {
    const { orgId } = useCurrentOrg()

    return (
        <PrivilegedRoute role={ROLES.ADMIN} orgId={orgId} redirect={ROUTES.SETTINGS}>
            <div className="min-w-0 pb-10 md:pt-0">
                <PageTransition initial={false}>{children}</PageTransition>
            </div>
        </PrivilegedRoute>
    )
}

export default GroupLayout
