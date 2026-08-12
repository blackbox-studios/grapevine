"use client"

import { cloneElement } from "react"
import { AnimatePresence, motion } from "motion/react"

import PostView from "@/components/PostView"
import { ROUTES } from "@/lib/constants"
import { useActiveSlide } from "@/lib/hooks/useSlideRoute.hook"
import { SLIDE_TRANSITION } from "@/lib/utils"

/* The surface each registered slide route renders, keyed by its prefix. This is the
 * only place that maps a slide route to a component — adding one is a single entry
 * here plus the SLIDE_ROUTES entry in constants.js and the standalone page that serves
 * the same URL when it's opened cold.
 *
 * A surface receives the route's dynamic param and is responsible for its own
 * presentation *and* its own enter/exit animation (so it can differ by breakpoint —
 * PostView swipes on mobile and fades as a dialog on desktop). Animate horizontally
 * with SLIDE_TRANSITION over a full viewport to stay locked to the pushed base. */
const SURFACES = {
    [ROUTES.POST]: (param) => <PostView variant="modal" postId={param} />,
}

/* The base surface a slide route pushes: the shell's page wrapper, holding the route
 * that stays mounted underneath. Slides a full viewport left — the same distance,
 * curve, and timing as the incoming surface, so the two move as one coupled unit
 * rather than one outrunning the other. Untouched by non-slide navigation.
 *
 * It is a flow element, not a viewport-sized box: the document is the scroller, so the
 * base is as tall as its content and the push is a pure horizontal transform that
 * leaves the scroll offset exactly where the reader left it. The document is frozen for
 * the duration (see SlideRouter), so nothing moves underneath while it's off-screen. */
export const SlideBase = ({ className, children }) => {
    const { pushed } = useActiveSlide()

    return (
        <motion.div
            className={className}
            animate={{ x: pushed ? "-100%" : 0 }}
            transition={SLIDE_TRANSITION}
        >
            {children}
        </motion.div>
    )
}

/* Renders the active slide route's surface. The shell owns it so it outlives the URL
 * change that opened it (see useSlideRoute). Mount it last in the layout so it stacks
 * above the nav.
 *
 * The surface is given a stable key off its prefix so AnimatePresence tracks one
 * instance across open → dismiss: on dismiss it retains this element, props and all,
 * and plays the surface's exit to completion before unmounting. That's also why the
 * param is read at render time rather than during the exit — the retained element
 * keeps the value it opened with, so the surface never blanks mid-animation.
 *
 * That retention is also what scopes the document scroll lock correctly: a surface
 * freezes the page from its own mount (see PostView), and AnimatePresence keeps it
 * mounted until the exit finishes — so scrolling comes back exactly when the base has
 * finished sliding home, not the instant the route changed. */
export const SlideRouter = () => {
    const { route, open } = useActiveSlide()
    const surface = route ? SURFACES[route.prefix] : null

    return (
        <AnimatePresence>
            {open && surface
                ? cloneElement(surface(route.param), { key: route.prefix })
                : null}
        </AnimatePresence>
    )
}

export default SlideRouter
