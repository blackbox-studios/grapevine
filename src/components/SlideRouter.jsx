"use client"

import { cloneElement } from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"

import NotificationsView from "@/components/NotificationsView"
import PostView from "@/components/PostView"
import { ROUTES } from "@/lib/constants"
import { useActiveSlide } from "@/lib/hooks/useSlideRoute.hook"
import { useMounted } from "@/lib/hooks/useMounted.hook"
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
    [ROUTES.NOTIFICATIONS]: (param, variant) => <NotificationsView variant={variant} />,
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

/* Renders every open slide-route surface, outermost first. The shell owns them so they
 * outlive the URL change that opened them (see useSlideRoute). Mount it last in the layout
 * so the stack sits above the nav.
 *
 * **Usually one, but not always.** A slide route can be opened from inside another — a
 * notification opens the post it is about — and rendering the whole stack rather than only
 * the topmost is what makes that read correctly in both directions. The covering surface
 * slides in over one that is still mounted underneath, so there is no moment of blank
 * screen; on dismissal the top exits and reveals the one below already in place, instead of
 * a second surface animating in from the right as though it were being opened afresh.
 * Everything below the top is completely covered, so it costs a mounted subtree and nothing
 * visual.
 *
 * Each surface is keyed by the **path it was opened at**, so AnimatePresence tracks one
 * instance across open → dismiss and two stacked surfaces of the same kind stay distinct.
 * On dismiss it retains that element, props and all, and plays the exit to completion — which
 * is also why the param is read at render time rather than during the exit: the retained
 * element keeps the value it opened with, so a surface never blanks mid-animation.
 *
 * No scroll lock is needed while any of this is up: a surface is a separate fixed layer over
 * the scroll container, so the container behind it can't be reached and scrolled. It keeps
 * its offset untouched and the reader lands right where they left off on dismiss. */
export const SlideRouter = () => {
    const { slides } = useActiveSlide()

    return (
        <AnimatePresence>
            {slides.map((slide) => {
                const surface = SURFACES[slide.prefix]
                if (!surface) return null
                return cloneElement(surface(slide.param, "modal"), { key: slide.path })
            })}
        </AnimatePresence>
    )
}

/* The cold-load half: a slide route reached by a hard navigation, a refresh, or a
 * shared link, where nothing is mounted behind it to overlay. It renders the same
 * registered surface in its `page` presentation, which covers the viewport instead of
 * sliding.
 *
 * This resolves the *pathname*, not a route segment, which is the whole point: a slide
 * route needs no page file of its own, so no dynamic segment exists for the static
 * export to enumerate and no post id has to be known at build time. It is mounted from
 * the protected shell's catch-all, so every registered slide route gets cold-load
 * handling for free — `fallback` is what that catch-all renders otherwise (the 404).
 *
 * **The portal to <body> lives here rather than in each surface**, because it is a property
 * of the cold load and not of any surface: a `page` is mounted inside the shell's page
 * wrapper, a low `z-1` context that a slide route may itself be mid-transform on, and only
 * escaping it lets the surface cover the viewport. The in-app `modal` needs none of this —
 * <SlideRouter/> already renders it above the nav, and portaling it would trap its exit. */
export const SlidePage = ({ fallback = null }) => {
    const pathname = usePathname()
    const mounted = useMounted()
    const { open } = useActiveSlide()
    const route = slideRouteFor(pathname)
    const surface = route ? SURFACES[route.prefix] : null

    /* **The cold-load half only, which is what `open` decides.** This resolves the pathname
     * alone, so on its own it cannot tell a URL this session opened from one it landed on —
     * and once a slide route is cold-loaded, this page stays mounted while a *second* slide
     * route is opened from inside it (a post tapped in a cold-loaded notifications panel).
     * The pathname now names the post, so without this the post renders twice: once here as
     * a `page` and once in <SlideRouter/> as a `modal`, two subtrees and two fetches, with
     * dismissing one leaving the other on screen. `open` is true exactly when the stack
     * already covers this pathname, which is exactly when this must render nothing. */
    if (open) return null
    if (!surface) return fallback
    return mounted ? createPortal(surface(route.param, "page"), document.body) : null
}

export default SlideRouter
