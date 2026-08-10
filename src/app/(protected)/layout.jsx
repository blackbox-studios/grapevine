"use client"

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import HomeIcon from "@/assets/svg/icons/home.svg"
import HomeOutlineIcon from "@/assets/svg/icons/home-outline.svg"
import SendIcon from "@/assets/svg/icons/send.svg"
import SendOutlineIcon from "@/assets/svg/icons/send-outline.svg"
import GroupIcon from "@/assets/svg/icons/group.svg"
import GroupOutlineIcon from "@/assets/svg/icons/group-outline.svg"
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import NavIcon from "@/components/NavIcon";
import NotificationsMenu from "@/components/Notifications";
import ProfileMenu from "@/components/Profile";
import { LoadOverlay } from "@/components/Loading";
import PageTransition from "@/components/PageTransition";
import { useScroll } from "@/lib/providers/Scroll";
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

const isActive = (pathname, href) =>
    href === ROUTES.DEFAULT ? pathname === ROUTES.DEFAULT : pathname.includes(href)

/* Renders a routed icon link with an outline↔filled crossfade for the active page.
 * The icon sits in a fixed --nav-width box so it never moves as the rail expands;
 * the label fades in only while the rail (the `group`) is hovered. */
const NavItem = ({ item, pathname, onNavigate }) => {
    const { title, href, Outline, Filled } = item
    const active = isActive(pathname, href)

    return (
        <Link
            href={href}
            aria-label={title}
            data-current={active}
            onClick={onNavigate}
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

/* Auth redirects are handled by middleware.js (see it for the protected-route gate). */
const ProtectedLayout = ({ children }) => {
    const pathname = usePathname()
    const { scrollRef, scrollToTop } = useScroll()
    const [navOpen, setNavOpen] = useState(false)

    return (
        <>
            <LoadOverlay />
                <Grain />
            <div className="relative h-screen w-full bg-background overflow-x-hidden">
                <div className="relative h-full w-full bg-background">

                    <nav
                        data-open={navOpen}
                        onMouseEnter={() => setNavOpen(true)}
                        onMouseLeave={() => setNavOpen(false)}
                        className={cn(
                            "group hidden md:flex fixed left-0 top-0 h-screen flex-col items-stretch overflow-hidden bg-background text-sidebar-foreground z-2 transition-[width,border-color] duration-200 ease-out",
                            navOpen ? "w-60 border-border" : "w-(--nav-width) border-transparent",
                        )}
                    >
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

                    <div ref={scrollRef} className="fixed left-0 md:left-(--nav-width) w-full md:w-[calc(100vw-var(--nav-width))] h-screen z-1 overflow-y-auto">
                        <div className="w-full h-fit px-4 md:px-8 lg:px-18 ">
                            <main className="flex flex-col w-full h-fit mx-auto max-w-8xl pt-8 md:pt-12 pb-[calc(var(--bottombar-height)+1.5rem)] md:pb-0">
                                {/* Collapse every /settings* route to one key so switching sub-tabs
                                    doesn't fade here — the Settings layout runs its own nested
                                    transition for that. */}
                                <PageTransition
                                    getKey={(pathname) => (pathname.startsWith(ROUTES.SETTINGS) ? ROUTES.SETTINGS : pathname)}
                                    onExitComplete={scrollToTop}
                                >
                                    {children}
                                </PageTransition>
                            </main>
                        </div>
                    </div>

                    <div className="fixed left-0 md:left-(--nav-width) w-full md:w-[calc(100vw-var(--nav-width))] h-screen z-0 pointer-events-none">
                        <div className="relative w-full h-full bg-background overflow-hidden">
                            <div className="hidden dark:block absolute -bottom-90 -right-100 w-200 h-200 bg-[#ffffff0d] rounded-full blur-3xl" />
                        </div>
                    </div>

                    <nav className="md:hidden fixed bottom-0 left-0 w-full h-(--bottombar-height) flex items-center justify-around px-6 bg-background/80 backdrop-blur-md text-sidebar-foreground z-20 pointer-events-auto">
                        {NAV.map((item, idx) => (
                            <NavItem key={idx} item={item} pathname={pathname} />
                        ))}
                        <NotificationsMenu />
                        <ProfileMenu />
                    </nav>
                </div>
            </div>
        </>
    )
}

export default ProtectedLayout
