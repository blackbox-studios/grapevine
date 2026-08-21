"use client"

import { cloneElement } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"

import PostView from "@/components/PostView"
import { ROUTES } from "@/lib/constants"
import { useActiveSlide } from "@/lib/hooks/useSlideRoute.hook"
import { useOrgNav } from "@/lib/store/org/hook"
import { SLIDE_TRANSITION, slideRouteFor } from "@/lib/utils"

/* The surface each registered slide route renders, keyed by its prefix. This is the
 * only place that maps a slide route to a component — adding one is a single entry
 * here plus the SLIDE_ROUTES entry in constants.js. There is no per-route page file:
 * <SlideRouter/> draws the in-app overlay and <SlidePage/> serves the same URL when
 * it's opened cold, both off this one map.
 *
 * A surface receives the route's dynamic param and the presentation it should take
 * (`modal` in-app, `page` for a cold load) and is responsible for its own presentation
 * *and* its own enter/exit animation (so it can differ by breakpoint — PostView swipes
 * on mobile and fades as a dialog on desktop). Animate horizontally with
 * SLIDE_TRANSITION over a full viewport to stay locked to the pushed base. */
const SURFACES = {
    [ROUTES.POST]: (param, variant) => <PostView variant={variant} postId={param} />,
}

/* The base surface a slide route pushes: the shell's scroll container, holding the route
 * that stays mounted underneath. Slides a full viewport left — the same distance,
 * curve, and timing as the incoming surface, so the two move as one coupled unit
 * rather than one outrunning the other. Untouched by non-slide navigation.
 *
 * The push is a pure horizontal transform on the container, so it leaves the scroll
 * offset exactly where the reader left it: the offset lives on this node, and nothing
 * underneath moves while it's off-screen because there's no separate document scroll to
 * drift. The layout attaches the shared scroll ref here (see ScrollProvider).
 *
 * **Two things can displace this container, and only one of them may win.** A slide route
 * takes it a full viewport left; the group switcher takes it one panel-width right. They
 * cannot compose — a sum would leave the base at an offset where neither surface lines up
 * with it — so the slide route takes precedence: it is the surface actually being read, and
 * a switcher panel is only ever open when nothing is over it anyway. Resolving that here,
 * on the one node that owns this container's position, is what keeps a second opinion about
 * its offset from ever existing.
 *
 * **This node cannot be the projection root that shields its contents from that movement**,
 * even though it is the thing doing the moving — `layoutRoot` needs a projection node, only
 * `layout`/`layoutId` create one, and `layout` on an element that also animates `x` is the
 * conflict framer explicitly warns about. The root is therefore the wrapper immediately
 * inside this one, in `(protected)/layout.jsx`; read the note there. */
export const SlideBase = ({ ref, className, children }) => {
    const { pushed } = useActiveSlide()
    const { shift } = useOrgNav()

    return (
        <motion.div
            ref={ref}
            className={className}
            animate={{ x: pushed ? "-100%" : shift }}
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
 * No scroll lock is needed while it's up: the surface is a separate fixed layer over the
 * scroll container, so the container behind it can't be reached and scrolled. It keeps
 * its offset untouched and the reader lands right where they left off on dismiss. */
export const SlideRouter = () => {
    const { route, open } = useActiveSlide()
    const surface = route ? SURFACES[route.prefix] : null

    return (
        <AnimatePresence>
            {open && surface
                ? cloneElement(surface(route.param, "modal"), { key: route.prefix })
                : null}
        </AnimatePresence>
    )
}

/* The cold-load half: a slide route reached by a hard navigation, a refresh, or a
 * shared link, where nothing is mounted behind it to overlay. It renders the same
 * registered surface in its `page` presentation, which portals to <body> and covers
 * the viewport instead of sliding.
 *
 * This resolves the *pathname*, not a route segment, which is the whole point: a slide
 * route needs no page file of its own, so no dynamic segment exists for the static
 * export to enumerate and no post id has to be known at build time. It is mounted from
 * the protected shell's catch-all, so every registered slide route gets cold-load
 * handling for free — `fallback` is what that catch-all renders otherwise (the 404). */
export const SlidePage = ({ fallback = null }) => {
    const pathname = usePathname()
    const route = slideRouteFor(pathname)
    const surface = route ? SURFACES[route.prefix] : null

    return surface ? surface(route.param, "page") : fallback
}

export default SlideRouter
