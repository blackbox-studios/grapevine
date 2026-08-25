"use client"

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import Logo from "@/assets/svg/logo.svg"
import HomeIcon from "@/assets/svg/icons/home.svg"
import HomeOutlineIcon from "@/assets/svg/icons/home-outline.svg"
import SendIcon from "@/assets/svg/icons/send.svg"
import SendOutlineIcon from "@/assets/svg/icons/send-outline.svg"
import { ROUTES } from "@/lib/constants";
import { SLIDE_TRANSITION, cn, isRouteActive, pageTransitionKey } from "@/lib/utils";
import { ProtectedGate } from "@/components/AuthGate";
import Compose from "@/components/Compose";
import { MemberGate } from "@/components/MemberGate";
import NavIcon from "@/components/NavIcon";
import { OrgNavPanel, OrgSwitcher } from "@/components/OrgNav";
import NotificationsMenu from "@/components/Notifications";
import { ProfileTrigger } from "@/components/Profile";
import PageTransition from "@/components/PageTransition";
import { SlideBase, SlideRouter } from "@/components/SlideRouter";
import { useVibing } from "@/lib/hooks/useScroll.hook";
import { useOrgNav } from "@/lib/store/org/hook";
import { useScroll } from "@/lib/providers/Scroll";
import Grain from "@/components/Grain";



/* There is no Groups entry here, and that is the point: a group is not a place you
 * navigate to, it is the scope everything else is read in. The group glyph belongs to
 * the switcher (<OrgNavTrigger/>, and the pill top-right on desktop), which changes
 * that scope in place rather than routing anywhere. */
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

/* The shell, rendered only once <ProtectedGate/> has opened.
 *
 * It is a separate component from the layout, and that is load-bearing: useVibing points
 * framer-motion's useScroll at `scrollRef`, which is attached to <SlideBase/> below — a
 * node the gate does not render until auth has settled. Hoist the hook into the layout,
 * above the gate, and its first effect runs against a null container: motion throws
 * "Container ref is defined but not hydrated", and because its start callback is memoized
 * on the ref's *identity* (which never changes), it never retries once the gate opens. The
 * mobile bar would then silently stop dimming for the rest of the session. Any future hook
 * that reads the scroll container belongs here, not in the layout.
 *
 * Slide routes need nothing from this file beyond <SlideBase/> (the surface they push)
 * and <SlideRouter/> (the surface itself): they open by shallow history navigation, so
 * the route rendered here never changes while one is up. Everything slide-route-specific
 * lives in the SLIDE_ROUTES registry; nothing about a given slide route is hard-coded
 * here. */
const ProtectedShell = ({ children }) => {
    const pathname = usePathname()
    const [navOpen, setNavOpen] = useState(false)
    const { scrollRef, scrollToTop } = useScroll()
    const { shift } = useOrgNav()
    const vibing = useVibing()

    return (
        <>
            <Grain />

            {/* Every layer here is a sibling stacked in one context, in z order: backdrop
                and the group panel (0), the scroll container (1), the desktop rail and the
                desktop switcher (2), the mobile bar (20), the group scrim (30), grain (40),
                overlays (50). Only the container scrolls; every other layer is fixed and
                stays put while it does — the mobile group trigger is not among them, it
                rides inside the container as an ordinary row of the page.

                The group panel shares z-0 with the backdrop and is mounted after it, so it
                paints on top of it and under everything else — it is uncovered by the shell
                sliding off it rather than by rising over anything. <OrgNavPanel/> also brings
                its own opaque plate at z-1, covering the bands the scroll container's
                --safe-top / --bottombar insets leave open; it is mounted before the container,
                so the container paints over it. */}
            <div className="fixed inset-0 z-0 overflow-hidden bg-background pointer-events-none">
                <div className="hidden lg:dark:block absolute -bottom-90 -right-100 w-250 h-250 bg-[#ffffff0d] rounded-full blur-3xl" />
            </div>

            <OrgNavPanel />

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
                        <Logo className="w-8 text-foreground" />
                    </span>
                </Link>

                <div className="flex flex-1 flex-col justify-center gap-2 px-2">
                    {NAV.map((item, idx) => (
                        <NavItem key={idx} item={item} pathname={pathname} onNavigate={() => setNavOpen(false)} />
                    ))}
                    {/* Below the destinations, because it is not one: composing opens a
                        surface over wherever the reader already is rather than routing
                        anywhere, and it is the only entry here that renders for some
                        viewers and not others. Hidden entirely from anyone who administers
                        no group — see <Compose/>. */}
                    <Compose />
                </div>
                <div className="pb-8 pt-6 px-2 flex flex-col gap-2">
                    <NavSlot><NotificationsMenu /></NavSlot>
                    <NavSlot><ProfileTrigger pathname={pathname} /></NavSlot>
                </div>
            </nav>

            {/* The shell's scroll container: a fixed box inset past the rail, and the app's
                one and only scroller. It's also the base surface a slide route pushes
                off-screen as it swipes in (SlideBase owns that motion). `overscroll-none`
                keeps a pull at either end from chaining out and hands the top-of-list pull
                to usePullToRefresh instead.

                On mobile it's bounded to the usable viewport — top at the status-bar inset,
                bottom at the mobile rail (--bottombar already folds in the home-indicator
                inset) — so the scrollbar starts below the notch and stops above the rail
                rather than running edge-to-edge under the system chrome, which is where an
                edge-to-edge Capacitor WebView draws it. Both insets are 0 / reset on md, so
                desktop keeps a full-height scroller past the rail.

                It is **opaque on mobile**, which the group panel depends on. The panel sits
                behind this container and is meant to be seen only through the gap the push
                opens up; with a transparent container the backdrop's colour comes from a
                layer further back, so the panel showed straight through the page at all
                times. Transparent again from md, where the panel does not exist and the
                backdrop's lg:dark gradient has to remain visible. */}
            <SlideBase
                ref={scrollRef}
                className="fixed inset-x-0 top-(--safe-top) bottom-(--bottombar) md:top-0 md:bottom-0 z-1 md:left-(--nav-width) overflow-y-auto overflow-x-hidden overscroll-none bg-background md:bg-transparent"
            >
                {/* **The layout-projection root for everything the shell scrolls.**
                    <SlideBase/> above is translated — one panel-width by the group switcher,
                    a full viewport by a slide route — and a layout animation is measured
                    against the viewport, so without a root inside that transform every
                    `layout` descendant reads the push as its own box moving and springs after
                    it on its own timing. The feed is a column of them, so closing the group
                    panel dragged a ripple down the cards while the rest of the page (the group
                    trigger, which has no layout animation) moved rigidly with the container.

                    `layoutRoot` makes descendants resolve against *this* node instead of the
                    page, so the container's displacement is not a layout change to anything
                    inside it — and it makes this node snap rather than animate its own, which
                    is what keeps it from simply inheriting the problem one level down. It has
                    to carry `layout` too: that is the only thing that creates the projection
                    node `layoutRoot` configures. <SlideBase/> cannot host either, because
                    `layout` on an element that also animates `x` is a conflict. */}
                <motion.div layout layoutRoot className="w-full px-4 md:px-8 lg:px-18">
                    {/* A plain gutter on mobile: nothing floats over the content any more, so
                        there is nothing here to dodge — the feed's group trigger is a row of
                        the feed itself and reserves its own space. Desktop's inset is doing
                        real work, clearing the fixed switcher top-right by enough that the
                        pill reads as occupying a header row of its own. */}
                    <main className="flex flex-col w-full mx-auto max-w-8xl pt-4 md:pt-24 pb-6 md:pb-0">
                        {/* Which routes are exempt from this cross-fade is decided by
                            pageTransitionKey off the route registries — nested trees
                            that fade their own sub-routes, and slide routes that must
                            leave their base mounted, unfaded, and unscrolled. */}
                        <PageTransition getKey={pageTransitionKey} onExitComplete={scrollToTop}>
                            {children}
                        </PageTransition>
                    </main>
                </motion.div>
            </SlideBase>

            {/* Dims out of the way while the reader is vibing (scrolling down) and comes
                back the moment they scroll up (or reach the top) — the way a browser
                retracts its own bars. It stays tappable throughout; only opacity changes.

                It travels with the group panel's push too, on the same value and curve as
                the scroll container above it: the rail belongs to the app, and a rail that
                stayed put while the content it navigates slid away would read as part of
                the panel. */}
            <motion.nav
                animate={{ x: shift }}
                transition={SLIDE_TRANSITION}
                className={cn(
                    "md:hidden fixed bottom-0 left-0 w-full h-(--bottombar) pb-(--safe-bottom) flex items-center justify-around px-6 bg-background/80 backdrop-blur-md text-sidebar-foreground z-20 pointer-events-auto transition-opacity duration-300 ease-out",
                    vibing ? "opacity-35" : "opacity-100",
                )}
            >
                {/* No bell here. Notifications are not a destination — they open over
                    wherever the reader is — and on a phone the trigger belongs at the top
                    right of the feed, which is where a thumb looks for it. See
                    (protected)/page.jsx. */}
                {NAV.map((item, idx) => (
                    <NavItem key={idx} item={item} pathname={pathname} />
                ))}
                <Compose />
                <ProfileTrigger pathname={pathname} />
            </motion.nav>

            <OrgSwitcher />

            {/* The slide-route surface. Last child so it stacks above the nav. */}
            <SlideRouter />
        </>
    )
}

/* Two gates, in order, answering two different questions.
 *
 *   <ProtectedGate>  are you signed in at all?          → /login
 *   <MemberGate>     signed in, but do you belong here? → /access or /welcome
 *
 * The order matters and the nesting is the enforcement: MemberGate reads the viewer, which
 * only exists once there is a session, so it must never run first. Neither renders its
 * children until it has an answer, so the shell below is only ever mounted for someone who
 * is signed in, admitted, and through orientation. */
const ProtectedLayout = ({ children }) => (
    <ProtectedGate>
        <MemberGate>
            <ProtectedShell>{children}</ProtectedShell>
        </MemberGate>
    </ProtectedGate>
)

export default ProtectedLayout
