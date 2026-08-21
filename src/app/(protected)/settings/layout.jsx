"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Privileged } from "@/components/Auth"
import PageTransition from "@/components/PageTransition"
import { ROLES, ROUTES } from "@/lib/constants"
import { cn } from "@/lib/utils"

/* `privileged` tabs only render for admins, via <Privileged>. The roster page redirects a
 * member who reaches it anyway, but a tab that bounces you is a worse answer than a tab
 * that was never there — and the API refuses the underlying read regardless, so a member
 * following the link could only ever have been shown an error. */
const TABS = [
    { title: "General", to: ROUTES.SETTINGS, end: true },
    { title: "Users", to: ROUTES.SETTINGS_USERS, privileged: true },
]

const SettingsLayout = ({ children }) => {
    const pathname = usePathname()

    /* `pt-12 md:pt-0` is the same mobile top gutter Inbox takes, for the same reason. */
    return (
        <div className="grid grid-cols-[10rem_1fr] gap-16 pt-12 md:pt-0 pb-10">
            <nav className="flex flex-col gap-3.5 sm:-ml-6">
                {TABS.map(({ title, to, end, privileged }) => {
                    const isActive = end ? pathname === to : pathname.startsWith(to)
                    const link = (
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

                    return privileged ? (
                        <Privileged key={to} role={ROLES.ADMIN}>
                            {link}
                        </Privileged>
                    ) : (
                        link
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
