"use client"

import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"

import { useMounted } from "@/lib/hooks/useMounted.hook"
import { cn } from "@/lib/utils"

/* The long-press treatment: the **whole viewport** blurs and one element is lifted out of
 * it, sharp, exactly where it already sat. `children` is what stays in focus, `rect` is the
 * viewport box to draw it at — from `getBoundingClientRect()` on the real element.
 * `components/Comments.jsx` is the reference caller.
 *
 * **It renders a copy, and the original has to hide itself.** That is not a shortcut, it is
 * the only way this works: the element being focused lives inside a Vaul drawer, and Vaul
 * positions that drawer with a transform, which makes it the containing block for every
 * `fixed` descendant *and* a stacking context they cannot escape. Nothing inside it can be
 * raised above a viewport-wide scrim, at any z-index. So the scrim is portaled to `<body>`
 * where it can cover everything, and the focused element is redrawn on top of it at its
 * measured coordinates. Leaving the original visible underneath would ring the copy with a
 * blurred halo of itself, since blur spreads past the box it came from.
 *
 * **The box is measured once, at the press.** Nothing here tracks the element afterwards,
 * because nothing can move it: the scrim covers the viewport and takes every pointer event,
 * so the surface underneath cannot be scrolled while the lens is open.
 *
 * It takes pointer events on purpose. A scrim that let taps through would let a
 * half-committed action also hit whatever sat under the finger — and staying tappable is
 * what lets a dismiss-on-outside-press surface close on the same gesture. */

/* The layer the scrim occupies, and the one directly above it for anything that must stay
 * sharp — a menu opening with the lens, most obviously.
 *
 * **The scrim cannot sit below `z-50`.** Every full-screen surface in the app — drawer,
 * dialog, popover — is `z-50` at `<body>` level, and the lens exists to blur whichever of
 * them is open. Drop it to 49 and it paints *underneath* the drawer, leaving the sheet it
 * was pointing at perfectly sharp. So it matches at 50 and wins on DOM order, being portaled
 * after anything already open, and whatever must out-paint it takes the step above.
 *
 * Exported so the number lives with the component that sets it rather than being retyped at
 * a call site, where a later reader has no way to tell what it is one more than. */
export const LENS_LAYER = "z-50"
export const ABOVE_LENS = "z-51"
export const FocusLens = ({ active, rect, children, className }) => {
    /* `createPortal` needs a document, and the app is prerendered to HTML at build time. */
    const mounted = useMounted()
    if (!mounted) return null

    return createPortal(
        <AnimatePresence>
            {active && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className={cn("fixed inset-0", LENS_LAYER)}
                >
                    <div
                        className={cn(
                            "absolute inset-0 bg-background/40 backdrop-blur-md",
                            className,
                        )}
                    />
                    {rect && (
                        /* The one place an inline style is unavoidable: these are measured
                         * pixels, and a class cannot carry a number that is only known at
                         * the moment of the press. */
                        <div
                            className="absolute"
                            style={{ top: rect.top, left: rect.left, width: rect.width }}
                        >
                            {children}
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    )
}

export default FocusLens
