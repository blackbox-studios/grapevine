"use client"

import Compose from "@/components/Compose"
import { NotificationsTrigger } from "@/components/Notifications"
import { OrgNavTrigger } from "@/components/OrgNav"
import { cn } from "@/lib/utils"

/* The phone's header for the feed: which group you are reading on the left, and on the right
 * the two controls that act on it rather than lead anywhere.
 *
 * ── Why the switcher is here ────────────────────────────────────────────────
 *
 * Everything in this app is read inside a selected group, and on a desktop the rail says so
 * permanently — the switcher is pinned top right and never leaves. A phone has no rail, so this
 * is not decoration; it is the only thing on screen naming the parish whose posts these are.
 *
 * ── Why the plus and the heart sit beside it ────────────────────────────────
 *
 * Neither is a destination. Both open a surface over wherever the reader already is, which is
 * why neither takes a slot on the mobile bar below, and the top right of the feed is where a
 * thumb looks for them. The plus is drawn only for an admin of some group and renders nothing
 * at all for anybody else — see <Compose/>.
 *
 * ── Why it lives in the page rather than in the shell ────────────────────────
 *
 * It sits in the page's own column, so it lines up with the post cards beneath it and scrolls
 * away with them. A shell-level bar would be pinned and a different width. */
const MobileHeader = ({ className }) => (
    <div className={cn("md:hidden flex items-center justify-between", className)}>
        <OrgNavTrigger />

        <div className="flex items-center gap-5">
            <Compose />
            <NotificationsTrigger className="-mr-1" />
        </div>
    </div>
)

export default MobileHeader
