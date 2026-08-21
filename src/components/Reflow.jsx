"use client"

import { useMemo } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { ROW_SPRING } from "@/lib/utils"

/* A list that closes over what leaves it and opens around what arrives.
 *
 * The comment thread established the shape and it is the same shape wherever a set of things
 * is added to and removed from in place — the composer's picked photos, next. Written once
 * here so the two move identically rather than approximately.
 *
 * Three decisions, and each is doing work:
 *
 *  - **`layout="position"`, not `layout`.** Position only, so a row is never squashed or
 *    stretched mid-flight while its neighbours resize around it. It is also why nothing here
 *    animates x/y/scale: a layout animation *is* a transform animation, and a second one
 *    fights it. The arriving item only fades; all the movement belongs to the items making
 *    room for it.
 *  - **`mode="popLayout"`.** A leaving item is pulled out of the flow as it starts to fade,
 *    so the list closes over it during the fade rather than snapping shut afterwards.
 *  - **`initial={false}`.** The first paint is quiet; only what arrives afterwards animates
 *    in. Without it every item of a freshly-loaded list fades up at once, which reads as the
 *    surface loading a second time.
 *
 * Items need a key that survives whatever they go through. An optimistic row swapped for the
 * server's resource changes id, so key on `localId ?? id` — keying on `id` alone replays the
 * entrance on confirmation.
 *
 * **A layout animation is measured against the viewport, so it notices ancestors moving.**
 * The shell's scroll container is translated by the group switcher and by slide routes, and
 * without a projection root inside that transform every item here reads the push as its own
 * box moving and springs after it — the list ripples while the rest of the page moves as one
 * plate. The root is on the page wrapper in `(protected)/layout.jsx`; a list rendered outside
 * the shell (a portalled dialog or drawer, as the comment thread and the composer are) is not
 * inside that transform and needs nothing.
 *
 * **No item may style itself by its position in the list.** No `first:`, no `last:`, no
 * `:nth-child` — put the spacing on the list and cancel the edges there instead. Those
 * selectors answer to *DOM* order, and a leaving item stays in the DOM for the whole of its
 * exit: the rule keeps matching the item on its way out and hands over on the single frame it
 * unmounts. The list glides the entire distance and then snaps by whatever that rule was
 * worth, with nothing animating the last step. It reads exactly like the animation failing at
 * the finish, and the cause is a class that has nothing to do with animation. */

/* The motion props an item carries, for the cases that cannot use `<ReflowItem/>` because
 * something else owns their element — `<HoldMenu/>` renders its own, and takes these as
 * `motionProps`. `animate` is deliberately absent: the owner sets it, since it is where the
 * item's resting opacity (an unconfirmed row dims to 0.6) and any override (a held row drops
 * to 0) are resolved.
 *
 * `spring` is the one thing that varies by list, because a spring settles in about the same
 * time whatever the distance — see `CARD_SPRING` in lib/utils.js. Comment rows and photo
 * tiles take the default; a list of feed cards passes the softer one. */
export const useReflowMotion = (spring = ROW_SPRING) => {
    const reduceMotion = useReducedMotion()

    return useMemo(() => ({
        layout: reduceMotion ? false : "position",
        initial: { opacity: 0 },
        exit: { opacity: 0 },
        transition: spring,
    }), [reduceMotion, spring])
}

/* **The list needs `position: relative`.** `popLayout` takes a leaving item out of the flow
 * by absolutely positioning it, which it measures against the nearest positioned ancestor —
 * without one on the list itself, a removed item animates out from somewhere else entirely. */
export const Reflow = ({ children }) => (
    <AnimatePresence initial={false} mode="popLayout">
        {children}
    </AnimatePresence>
)

/* One item. `opacity` is its resting value, so a not-yet-confirmed item can render dimmed
 * without giving up the fade in and out. */
export const ReflowItem = ({ opacity = 1, spring, className, children, ...props }) => {
    const motionProps = useReflowMotion(spring)

    return (
        <motion.div
            {...motionProps}
            animate={{ opacity }}
            className={className}
            {...props}
        >
            {children}
        </motion.div>
    )
}

export default Reflow
