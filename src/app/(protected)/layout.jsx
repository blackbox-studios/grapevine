"use client"

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import HomeIcon from "@/assets/svg/icons/home.svg"
import AddLinkIcon from "@/assets/svg/icons/add-link.svg"
import DatabaseIcon from "@/assets/svg/icons/database.svg"
import { ROUTES } from "@/lib/constants";
import { appPath } from "@/lib/utils";
import Crest from "@/components/Crest"
import Breadcrumb from "@/components/Breadcrumb";
import Icon from "@/components/Icon";
import NotificationsMenu from "@/components/Notifications";
import ProfileMenu from "@/components/Profile";
import { LoadOverlay } from "@/components/Loading";
import PageTransition from "@/components/PageTransition";
import { useScroll } from "@/lib/providers/Scroll";
import Grain from "@/components/Grain";



const NAV = [
    {
        title: "Dashboard",
        href: ROUTES.DEFAULT,
        Icon: HomeIcon
    },
    {
        title: "Connect",
        href: ROUTES.CONNECT,
        Icon: AddLinkIcon
    },
    {
        title: "Credentials",
        href: ROUTES.CREDENTIALS,
        Icon: DatabaseIcon
    },
]

/* Auth redirects are handled by middleware.js (see it for the protected-route gate). */
const ProtectedLayout = ({ children }) => {
    const pathname = usePathname()
    const { scrollRef, scrollToTop } = useScroll()
    const [menuOpen, setMenuOpen] = useState(false);
    const closeMenu = () => setMenuOpen(false);

    return (
        <>
            <LoadOverlay />
            <div className="relative h-screen w-full bg-sidebar overflow-x-hidden">
                <div
                    aria-hidden={!menuOpen}
                    className="md:hidden fixed right-0 top-0 h-svh w-(--mobile-menu-width) flex flex-col text-sidebar-foreground select-none"
                >
                    <button
                        type="button"
                        aria-label="Close menu"
                        onClick={closeMenu}
                        className="self-end p-6 mt-2 mr-2 cursor-pointer text-sidebar-foreground"
                    >
                        <Icon size="xl">close</Icon>
                    </button>
                    <div className="flex flex-col gap-1 mt-4 px-7">
                        {NAV.map(({ title, href, Icon }, idx) => (
                            <Link
                                key={idx}
                                href={href}
                                onClick={closeMenu}
                                data-current={href === ROUTES.DEFAULT ? pathname === ROUTES.DEFAULT : pathname.includes(href)}
                                className="flex items-center gap-4 py-3 opacity-66 data-[current=true]:opacity-100 transition-opacity"
                            >
                                <Icon className="w-6 h-6 shrink-0" />
                                <span className="text-xl font-medium">{title}</span>
                            </Link>
                        ))}
                    </div>
                    <div className="mt-auto pb-10 px-7 flex items-end justify-between">
                        <div className="pb-2.5">
                            <NotificationsMenu />
                        </div>
                        <ProfileMenu />
                    </div>
                </div>

                <motion.div
                    className="relative h-full w-full bg-sidebar"
                    animate={{ x: menuOpen ? "calc(var(--mobile-menu-width) * -1)" : 0 }}
                    transition={{ ease: [0.45, 0, 0, 1], duration: 0.5 }}
                >
                    <Grain />
                    <nav className="hidden md:grid fixed left-0 w-(--nav-width) h-screen grid-rows-[1fr_auto] text-sidebar-foreground z-2">
                        <div className="flex w-full items-center min-h-130">
                            <div className="h-fit flex flex-col w-full">
                                {NAV.map(({ title, href, Icon }, idx) =>
                                    <Link key={idx} data-current={href === ROUTES.DEFAULT ? pathname === ROUTES.DEFAULT : pathname.includes(href)} className="group cursor-pointer -my-7.5 select-none" href={href}>
                                        <div key={title} className="relative h-39 flex">
                                            <div className="w-full h-fit flex flex-col gap-2 my-auto pt-1 group-data-[current=false]:opacity-66 transition-opacity duration-400 ease-in-out">
                                                <Icon className="mx-auto my-auto" />
                                                <p className="text-center font-medium">{title}</p>
                                            </div>
                                            <div className=" absolute top-0 h-fit bg-sidebar -z-1  w-(--nav-width)  group-data-[current=true]:opacity-100 opacity-0 transition-opacity duration-400 ease-in-out">
                                                <Grain className="absolute -z-1"/>
                                                <img src={appPath("/nob.png")} className="w-full h-full dark:hidden " alt="necessary indicator nob" />
                                                <img src={appPath("/nob-dark.png")} className=" w-full h-full hidden dark:block " alt="necessary indicator nob" />
                                            </div>
                                        </div>
                                    </Link>
                                )}
                            </div>

                        </div>
                        <div className="pb-8 flex flex-col items-center gap-6 pt-6">
                            <NotificationsMenu />
                            <ProfileMenu />
                        </div>
                    </nav>

                    <nav className="px-4 md:px-8 fixed left-0 md:left-(--nav-width) top-0 md:top-(--bumper) w-[calc(100vw-var(--scrollbar-width))] md:w-[calc(100vw-var(--nav-width)-(2*var(--bumper)))] h-(--topbar-height) flex bg-background/20 backdrop-blur-md pointer-events-auto z-10 md:rounded-full">
                        <div className="flex flex-row gap-4 md:gap-8 items-center min-w-0">
                            <Crest className="my-auto h-8 w-auto opacity-80 shrink-0" />
                            <Breadcrumb className="pt-0.5" />
                        </div>
                        <button
                            type="button"
                            aria-label={menuOpen ? "Close menu" : "Open menu"}
                            aria-expanded={menuOpen}
                            onClick={() => setMenuOpen(x => !x)}
                            className="ml-auto md:hidden flex flex-col items-center justify-center gap-1.5 p-3 -mr-1 cursor-pointer"
                        >
                            <span className="h-[1.5px] w-6 bg-foreground" />
                            <span className="h-[1.5px] w-6 bg-foreground" />
                        </button>
                    </nav>

                    <div ref={scrollRef} className="fixed left-0 md:left-(--nav-width) w-full md:w-[calc(100vw-var(--nav-width))] h-screen md:h-[calc(100vh-(2*var(--bumper)))] md:mt-(--bumper) md:pr-(--bumper) z-1 overflow-y-auto">
                        <div className="w-full h-fit px-4 md:px-8 lg:px-18 ">
                            <main className="flex flex-col w-full h-fit mx-auto max-w-8xl pt-[calc(var(--topbar-height)+2rem)] md:pt-[calc(var(--topbar-height)+3rem)]">
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

                    <div className="fixed left-0 md:left-(--nav-width) w-full md:w-[calc(100vw-var(--nav-width))] h-screen md:py-(--bumper) md:pr-(--bumper) z-0 pointer-events-none">
                        <div className="panel relative w-full h-full md:rounded-l-5xl md:rounded-r-5xl bg-background overflow-hidden">
                            <div className="hidden dark:block absolute -bottom-90 -right-100 w-200 h-200 bg-[#ffffff0d] rounded-full blur-3xl" />
                        </div>
                    </div>

                    <AnimatePresence>
                        {menuOpen && (
                            <motion.div
                                key="menu-overlay"
                                onClick={closeMenu}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.5 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.4 }}
                                className="md:hidden fixed inset-0 bg-background z-20 cursor-pointer"
                            />
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>
        </>
    )
}

export default ProtectedLayout
