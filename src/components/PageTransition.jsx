"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { usePathname } from "next/navigation"

import { cn, transition } from "@/lib/utils"
import FrozenRouter from "@/components/FrozenRouter"

/* Cross-fades App Router page changes. Mirrors the old react-router
 * RouteTransition/Outlet pair: `getKey` lets a layout collapse a group of routes
 * to one key (so navigating within them doesn't fade at this level — the nested
 * layout handles it instead), and FrozenRouter keeps the outgoing page frozen on
 * its old route while it fades. Because a layout persists across navigation, the
 * AnimatePresence lives long enough for exit animations to actually play. */
export default function PageTransition({
    children,
    getKey,
    initial = true,
    fast = true,
    slow = false,
    onExitComplete,
    className,
}) {
    const pathname = usePathname()
    const shouldReduceMotion = useReducedMotion()
    const key = getKey ? getKey(pathname) : pathname
    const duration = fast ? 0.2 : slow ? 0.4 : 0.3

    return (
        <AnimatePresence mode="wait" initial={initial} onExitComplete={onExitComplete}>
            <motion.div
                key={key}
                {...transition(shouldReduceMotion, duration)}
                className={cn("relative w-full h-full", className)}
            >
                <FrozenRouter>{children}</FrozenRouter>
            </motion.div>
        </AnimatePresence>
    )
}
