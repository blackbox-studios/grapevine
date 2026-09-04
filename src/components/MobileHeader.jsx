"use client"

import { NotificationsTrigger } from "@/components/Notifications"
import { OrgNavTrigger } from "@/components/OrgNav"
import { cn } from "@/lib/utils"

/* The phone's header for a group-scoped surface: which group you are reading on the left, the
 * bell on the right.
 *
 * ── Why every such surface has one ───────────────────────────────────────────
 *
 * Everything in this app is read inside a selected group, and on a desktop the rail says so
 * permanently — the switcher is pinned top right and never leaves. A phone has no rail, so
 * without this a reader looking at a rota or a feed has nothing on screen naming the parish it
 * belongs to. The switcher is not decoration here; it is the only thing carrying the scope.
 *
 * The bell rides along because it is **not a destination** — it opens a surface over wherever
 * the reader already is, which is why it is absent from the mobile rail below. The top right of
 * whatever screen somebody is on is where a thumb looks for it.
 *
 * ── Why it lives in the page rather than in the shell ────────────────────────
 *
 * It sits in the page's own column, so it lines up with the content beneath it — the feed's
 * post cards, the calendar's grid — and scrolls away with them. A shell-level bar would be
 * pinned, a different width, and would need to know which surfaces want it.
 *
 * `className` is the spacing, because that is the one thing each page genuinely differs on: the
 * feed pays its own `pb-6`, while a page whose column already carries a `gap` needs nothing. */
const MobileHeader = ({ className }) => (
    <div className={cn("md:hidden flex items-center justify-between", className)}>
        <OrgNavTrigger />
        <NotificationsTrigger className="-mr-1" />
    </div>
)

export default MobileHeader
