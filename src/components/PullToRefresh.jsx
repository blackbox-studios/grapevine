"use client"

import { motion, useTransform } from "motion/react"

import Ripple from "@/assets/svg/ripple.svg"
import { usePullToRefresh } from "@/lib/hooks/useScroll.hook"

/* Wraps a scroll region with an Instagram-style pull-to-refresh (mobile / touch only —
 * see usePullToRefresh for why it never fires under a mouse). The ripple loader is pinned
 * to the top and sits *behind* the content, which is what drags: pulling the content down
 * uncovers the loader in the space that opens above it. The loader itself never moves — it
 * only fades/scales in as `progress` climbs, and is left spinning at the threshold while
 * the refresh runs before the content springs back up over it.
 *
 * `onRefresh` should return a promise (e.g. a store's `refresh`); the spinner holds until
 * it settles. */
const PullToRefresh = ({ onRefresh, children }) => {
    const { y, progress, refreshing } = usePullToRefresh(onRefresh)
    const scale = useTransform(progress, [0, 1], [0.7, 1])

    return (
        <div className="relative">
            <motion.div
                aria-hidden={!refreshing}
                style={{ opacity: progress, scale }}
                className="pointer-events-none absolute inset-x-0 -top-2 z-0 flex justify-center"
            >
                <Ripple
                    aria-label="Refreshing"
                    className="size-9 text-primary [&_circle]:stroke-current"
                />
            </motion.div>

            <motion.div style={{ y }} className="relative z-10">
                {children}
            </motion.div>
        </div>
    )
}

export default PullToRefresh
