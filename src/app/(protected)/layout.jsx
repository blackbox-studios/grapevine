"use client"

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/assets/svg/logo.svg"
import HomeIcon from "@/assets/svg/icons/home.svg"
import HomeOutlineIcon from "@/assets/svg/icons/home-outline.svg"
import SendIcon from "@/assets/svg/icons/send.svg"
import SendOutlineIcon from "@/assets/svg/icons/send-outline.svg"
import GroupIcon from "@/assets/svg/icons/group.svg"
import GroupOutlineIcon from "@/assets/svg/icons/group-outline.svg"
import { ROUTES } from "@/lib/constants";
import { cn, isRouteActive, pageTransitionKey } from "@/lib/utils";
import { ProtectedGate } from "@/components/AuthGate";
import NavIcon from "@/components/NavIcon";
import NotificationsMenu from "@/components/Notifications";
import ProfileMenu from "@/components/Profile";
import PageTransition from "@/components/PageTransition";
import { SlideBase, SlideRouter } from "@/components/SlideRouter";
import { scrollToTop, useVibing } from "@/lib/hooks/useScroll.hook";
import Grain from "@/components/Grain";



const NAV = [
    {
        title: "Home",
        href: ROUTES.DEFAULT,
        Outline: HomeOutlineIcon,
        Filled: HomeIcon,
    },
    {
        title: "Inbox",
        href: ROUTES.INBOX,
        Outline: SendOutlineIcon,
        Filled: SendIcon,
    },
    {
        title: "Groups",
        href: ROUTES.GROUPS,
        Outline: GroupOutlineIcon,
        Filled: GroupIcon,
    },
]

/* Renders a routed icon link with an outline↔filled crossfade for the active page.
 * The icon sits in a fixed --nav-width box so it never moves as the rail expands;
 * the label fades in only while the rail (the `group`) is hovered. */
const NavItem = ({ item, pathname, onNavigate }) => {
    const { title, href, Outline, Filled } = item
    /* Resolves through the base route, so an open slide route (a post over the feed)
     * keeps its base tab lit rather than un-highlighting the whole nav. */
    const active = isRouteActive(pathname, href)

    return (
        <Link
            href={href}
            aria-label={title}
            data-current={active}
            onClick={onNavigate}
            /* The layout scrolls to top itself once the cross-fade has played out;
             * Next's own scroll would fire up front and yank the outgoing page. */
            scroll={false}
            className="flex items-center justify-center md:justify-start select-none cursor-pointer md:h-12 md:rounded-md md:transition-colors md:hover:bg-accent"
        >
            <span className="flex items-center justify-center md:w-[calc(var(--nav-width)-1rem)] md:shrink-0">
                <NavIcon Outline={Outline} Filled={Filled} active={active} />
            </span>
            <span
                className={cn(
                    "hidden md:block whitespace-nowrap pr-4 text-base leading-none opacity-0 transition-opacity duration-200 ease-out group-data-[open=true]:opacity-100",
                    active ? "font-bold" : "font-normal",
                )}
            >
                {title}
            </span>
        </Link>
    )
}

/* Centers a bottom-rail menu trigger in the same fixed icon box as NavItem, so
 * its glyph stays put when the rail expands. */
const NavSlot = ({ children }) => (
    <div className="flex items-center h-12">
        <span className="w-[calc(var(--nav-width)-1rem)] shrink-0 flex items-center justify-center">
            {children}
        </span>
    </div>
)

/* Auth redirects are handled by <AuthGate/> (see it for the protected-route gate).
 *
 * Slide routes need nothing from this file beyond <SlideBase/> (the surface they push)
 * and <SlideRouter/> (the surface itself): they open by shallow history navigation, so
 * the route rendered here never changes while one is up. Everything slide-route-specific
 * lives in the SLIDE_ROUTES registry; nothing about a given slide route is hard-coded
 * here. */
const ProtectedLayout = ({ children }) => {
    const pathname = usePathname()
    const [navOpen, setNavOpen] = useState(false)
    const vibing = useVibing()

    return (
        <ProtectedGate>
            <Grain />

            {/* Every layer here is a sibling in the document's own stacking context, in
                z order: backdrop (0), the page (1), the rail (2), grain (10), the mobile
                bar (20), overlays (50). Nothing wraps the page in a full-height box —
                the document scrolls, so the fixed layers simply stay put while it does. */}
            <div className="fixed inset-0 z-0 overflow-hidden bg-background pointer-events-none">
                <div className="hidden lg:dark:block absolute -bottom-90 -right-100 w-250 h-250 bg-[#ffffff0d] rounded-full blur-3xl" />
            </div>

            <nav
                data-open={navOpen}
                onMouseEnter={() => setNavOpen(true)}
                onMouseLeave={() => setNavOpen(false)}
                className={cn(
                    "group hidden md:flex fixed inset-y-0 left-0 flex-col items-stretch overflow-hidden bg-background/70 supports-backdrop-filter:bg-background/50 backdrop-blur-md text-sidebar-foreground z-2 pt-(--safe-top) pb-(--safe-bottom) pl-(--safe-left) transition-[width,border-color] duration-200 ease-out",
                    navOpen ? "w-60 border-border" : "w-(--nav-width) border-transparent",
                )}
            >
                {/* Brand mark pinned to the top of the rail, aligned in the same
                  * fixed icon column as the nav items so it stays put on expand. */}
                <Link
                    href={ROUTES.DEFAULT}
                    aria-label="Home"
                    scroll={false}
                    onClick={() => setNavOpen(false)}
                    className="flex items-center px-2 pt-8 md:pt-12"
                >
                    <span className="flex items-center justify-center md:w-[calc(var(--nav-width)-1rem)] md:shrink-0">
                        <Logo className="w-7 text-foreground" />
                    </span>
                </Link>

                <div className="flex flex-1 flex-col justify-center gap-2 px-2">
                    {NAV.map((item, idx) => (
                        <NavItem key={idx} item={item} pathname={pathname} onNavigate={() => setNavOpen(false)} />
                    ))}
                </div>
                <div className="pb-8 pt-6 px-2 flex flex-col gap-2">
                    <NavSlot><NotificationsMenu /></NavSlot>
                    <NavSlot><ProfileMenu /></NavSlot>
                </div>
            </nav>

            {/* The page itself: ordinary document flow, inset past the rail rather than
                sized against the viewport, so its height is its content's height and the
                document is what scrolls. Also the base surface a slide route pushes
                off-screen as it swipes in (SlideBase owns that motion). */}
            <SlideBase className="relative z-1 w-full md:pl-(--nav-width)">
                <div className="w-full px-4 md:px-8 lg:px-18 pt-(--safe-top)">
                    <main className="flex flex-col w-full mx-auto max-w-8xl pt-8 md:pt-12 pb-[calc(var(--bottombar)+1.5rem)] md:pb-0">
                        {/* Which routes are exempt from this cross-fade is decided by
                            pageTransitionKey off the route registries — nested trees
                            that fade their own sub-routes, and slide routes that must
                            leave their base mounted, unfaded, and unscrolled. */}
                        <PageTransition getKey={pageTransitionKey} onExitComplete={scrollToTop}>
                            {children}
                        </PageTransition>
                    </main>
                </div>
            </SlideBase>

            {/* Dims out of the way while the reader is vibing (scrolling down) and comes
                back the moment they scroll up (or reach the top) — the way a browser
                retracts its own bars. It stays tappable throughout; only opacity changes. */}
            <nav
                className={cn(
                    "md:hidden fixed bottom-0 left-0 w-full h-(--bottombar) pb-(--safe-bottom) flex items-center justify-around px-6 bg-background/80 backdrop-blur-md text-sidebar-foreground z-20 pointer-events-auto transition-opacity duration-300 ease-out",
                    vibing ? "opacity-35" : "opacity-100",
                )}
            >
                {NAV.map((item, idx) => (
                    <NavItem key={idx} item={item} pathname={pathname} />
                ))}
                <NotificationsMenu />
                <ProfileMenu />
            </nav>

            {/* The slide-route surface. Last child so it stacks above the nav. */}
            <SlideRouter />
        </ProtectedGate>
    )
}

export default ProtectedLayout
