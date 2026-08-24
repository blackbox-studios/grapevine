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
 * and the same set of destinations was expressed twice, differently, at two sizes. `/profile`
 * is one place with one list, so adding a destination is a row rather than a decision about
 * which of the two surfaces it belongs on.
 *
 * The avatar is the viewer's real profile picture via <Avatar/>, with the same gradient-and-
 * initials fallback every other avatar in the app uses — the old trigger drew its own bordered
 * circle of initials and could never show a photo at all.
 *
 * The ring marks it as the current tab, resolved through `isRouteActive` like every other nav
 * destination rather than a `pathname ===` of its own. */
export const ProfileTrigger = ({ pathname: pathnameProp, className }) => {
    const user = useUser()
    const livePathname = usePathname()
    const pathname = pathnameProp ?? livePathname
    const active = isRouteActive(pathname, ROUTES.PROFILE)

    return (
        <Link
            href={ROUTES.PROFILE}
            aria-label="Your profile"
            data-current={active}
            /* The layout scrolls the container to top itself once the cross-fade has played;
               Next's own scroll fires up front and yanks the outgoing page. */
            scroll={false}
            className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full outline-hidden transition-[box-shadow]",
                active && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                className,
            )}
        >
            <Avatar person={user} className="size-10" />
        </Link>
    )
}

export default ProfileTrigger
