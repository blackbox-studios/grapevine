"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Avatar } from "@/components/Widgets"
import { ROUTES } from "@/lib/constants"
import { useUser } from "@/lib/store/auth/hook"
import { cn, isRouteActive } from "@/lib/utils"

/* The way into the account surface, in the nav on both breakpoints.
 *
 * **A link, not a menu.** It used to be a popover holding a Settings button and a Logout
 * button, which put the viewer's identity and everything that hangs off it inside a container
 * that could hold about two of them — so Settings became a page with a tab rail of its own,
 * and the same set of destinations was expressed twice, differently, at two sizes. `/settings`
 * is one place with one list, so adding a destination is a row rather than a decision about
 * which of the two surfaces it belongs on.
 *
 * The avatar is the viewer's real profile picture via <Avatar/>, with the same gradient-and-
 * initials fallback every other avatar in the app uses — the old trigger drew its own bordered
 * circle of initials and could never show a photo at all.
 *
 * The ring marks it as the current tab, resolved through `isRouteActive` like every other nav
 * destination rather than a `pathname ===` of its own — and that is what keeps it lit on the
 * sub-pages too. `isRouteActive` is a **segment-safe prefix** test, so `/settings/general` and
 * `/settings/users` light the same trigger `/settings` does: the whole tree is one destination
 * as far as the nav is concerned, which is the truth now that the account surface is its index.
 * A `pathname === ROUTES.SETTINGS` here would drop the ring the moment a row was tapped, and
 * leave the reader on a screen no tab claims. */
export const ProfileTrigger = ({ pathname: pathnameProp, className }) => {
    const user = useUser()
    const livePathname = usePathname()
    const pathname = pathnameProp ?? livePathname
    const active = isRouteActive(pathname, ROUTES.SETTINGS)

    return (
        <Link
            href={ROUTES.SETTINGS}
            aria-label="Your profile"
            data-current={active}
            /* The layout scrolls the container to top itself once the cross-fade has played;
               Next's own scroll fires up front and yanks the outgoing page. */
            scroll={false}
            className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full outline-hidden transition-[box-shadow]",
                active && "ring-2 ring-foreground ring-offset-0 ring-offset-background",
                className,
            )}
        >
            <Avatar person={user} className="size-8" />
        </Link>
    )
}

export default ProfileTrigger
