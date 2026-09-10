"use client"

import { motion } from "motion/react"

import { Overlay } from "@/components/Widgets"
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

/* The same slide route on a wide screen: a centred dialog over a dimmed backdrop.
 *
 * **A slide route has two presentations, not two implementations.** The mechanism is
 * one URL resolved out of `RUNTIME_ROUTES`; what changes with the breakpoint is only
 * how it is put on screen — a full-height sheet that pushes the page aside on a phone
 * (<SlideSurface/> above), a dialog on a desktop, where a full-screen takeover would
 * read as the app having navigated somewhere. Every surface that answers a slide route
 * needs both halves, so both live here rather than being rebuilt per surface.
 *
 * It is <Overlay/> underneath, which is what carries the **fade in and out** — the same
 * one the open post uses. That matters more than it looks: these are rendered inside
 * <SlideRouter/>'s <AnimatePresence>, so a surface that skips it does not merely lack a
 * flourish, it appears and disappears in a single frame while every sibling surface
 * eases, and the inconsistency is the thing a reader notices.
 *
 * `close={false}`: the screen-corner Close belongs to a surface that fills the screen,
 * and each dialog here has its own header to hang a close or a back arrow off.
 *
 * `className` is the panel's size, which is the one thing that genuinely differs — a
 * notification list and a conversation want different heights. */
export const SlideDialog = ({ dismiss, label, className, children }) => (
    <Overlay dismiss={dismiss} label={label} close={false}>
        <div
            className={cn(
                "relative z-10 flex w-full flex-col overflow-hidden rounded-2xl border bg-background shadow-lg",
                className,
            )}
        >
            {children}
        </div>
    </Overlay>
)
