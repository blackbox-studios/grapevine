"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import PageTransition from "@/components/PageTransition"
import { ROUTES } from "@/lib/constants"
import { cn } from "@/lib/utils"

const TABS = [
    { title: "General", to: ROUTES.SETTINGS, end: true },
    { title: "Users", to: ROUTES.SETTINGS_USERS },
]

const SettingsLayout = ({ children }) => {
    const pathname = usePathname()

    return (
        <div className="grid grid-cols-[10rem_1fr] gap-16 pb-10">
            <nav className="flex flex-col gap-3.5 sm:-ml-6">
                {TABS.map(({ title, to, end }) => {
                    const isActive = end ? pathname === to : pathname.startsWith(to)
                    return (
                        <Link
                            key={to}
                            href={to}
                            /* Sub-tabs cross-fade in place; Next's scroll-to-top would
                               throw the reader to the top of Settings on every switch. */
                            scroll={false}
                            className={cn(
                                "rounded-full px-6 py-3.5 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {title}
                        </Link>
                    )
                })}
            </nav>

            <div className="min-h-[60dvh] border-l pl-16">
                {/* Nested transition: fades between General/Users while the Settings
                    pane itself stays mounted. Its own FrozenRouter keeps this working
                    at the nested level. */}
                <PageTransition initial={false}>{children}</PageTransition>
            </div>
        </div>
    )
}

export default SettingsLayout
