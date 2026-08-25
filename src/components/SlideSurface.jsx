"use client"

import { motion } from "motion/react"

import { cn, slideSurfaceAnim } from "@/lib/utils"

/* The full-screen sheet a slide route takes on a phone: the box, the safe-area inset, the
 * lift over the keyboard, and the enter/exit animation for whichever presentation it is in.
 *
 * Everything here is a property of *being* a slide-route surface rather than of any one of
 * them, which is why it is a wrapper and not a pattern each surface repeats. Two parts are
 * easy to get subtly wrong alone:
 *
 *  - **The bottom edge is the keyboard, not the mobile rail.** A slide route owns the whole
 *    screen — `z-50` already clears the rail's `z-20` — and stopping above it reads as the
 *    page ending early. Lifting by `--keyboard-inset` is also what carries anything pinned to
 *    this surface's foot up with the keyboard, so a composer inside needs no padding of its
 *    own. What the rail's inset used to provide there was clearance over the home indicator;
 *    a bottom-pinned child pads by `--bottom-inset - --keyboard-inset` to get it back.
 *  - **The animation is `slideSurfaceAnim`**, the same value <SlideBase/> pushes on, so the
 *    incoming surface and the base it displaces travel the same distance on the same curve
 *    and stay locked together for the whole gesture.
 *
 * It lives in its own file rather than beside the registry in `SlideRouter.jsx`, because a
 * surface imports this while the registry imports every surface — the two would form a cycle.
 *
 * `className` is for what genuinely differs, which so far is only a surface's background.
 * `ref` forwards, because a surface may need to measure itself (see <PostSlide/>). */
export const SlideSurface = ({ ref, variant, className, children }) => (
    <motion.div
        ref={ref}
        className={cn(
            "fixed inset-x-0 top-0 bottom-(--keyboard-inset) z-50 flex flex-col overflow-hidden pt-(--safe-top) transition-[bottom] duration-250 ease-out",
            className,
        )}
        {...slideSurfaceAnim(variant)}
    >
        {children}
    </motion.div>
)

export default SlideSurface
