"use client"

import { useEffect, useState } from "react"
import { useMotionValueEvent, useScroll } from "motion/react"

/* Everything scroll-related, in one place. The app scrolls the document itself (no
 * fixed inner container), so these all read/act on the window: framer-motion's
 * useScroll already tracks the page by default, and the lock freezes <html>. */

/* Scrolls the document to the top. Navigation runs with `scroll: false` so Next doesn't
 * jump the outgoing page mid-cross-fade; the layout calls this from the transition's
 * onExitComplete once the fade has finished instead. */
export const scrollToTop = (options = {}) => {
    window.scrollTo({ top: 0, ...options })
}

/* -------------------------------------------------------------------------- */
/* Scroll lock                                                                */
/* -------------------------------------------------------------------------- */

/* Freezes the document scroll while an overlay owns the screen. Without it the page
 * keeps scrolling behind a slide route / dialog / drawer — two live scrollbars, and a
 * backdrop that drifts under the surface. Locking <html> (the scroller) rather than
 * <body> is what holds in a WebView; the reserved scrollbar gutter in globals.css keeps
 * the lock from reflowing the page by the scrollbar's width.
 *
 * The count and captured offset are module-level so overlaps compose: a dialog opened
 * from inside another surface must not unlock the document when only it closes — only
 * the outermost release restores. The offset is re-applied as insurance against an
 * engine that doesn't preserve scrollTop across the overflow change. */
const LOCKED = "scroll-locked"

let locks = 0
let offset = 0

/* Holds the lock for as long as `locked` is true, releasing it on unmount. Lock and
 * release live inside the effect so all the freeze logic is in one place. */
export const useScrollLock = (locked) => {
    useEffect(() => {
        if (!locked) return

        if (locks++ === 0) {
            offset = window.scrollY
            document.documentElement.classList.add(LOCKED)
        }

        return () => {
            if (locks === 0 || --locks > 0) return
            document.documentElement.classList.remove(LOCKED)
            if (Math.abs(window.scrollY - offset) > 1) window.scrollTo(0, offset)
        }
    }, [locked])
}

/* -------------------------------------------------------------------------- */
/* Vibing                                                                     */
/* -------------------------------------------------------------------------- */

/* Always keep the chrome up near the top of the page, regardless of last direction. */
const REVEAL_ABOVE = 64
/* Ignore sub-pixel jitter and momentum-scroll reversals so nothing flickers. */
const DELTA = 8

/* True while the reader is "vibing" — scrolling *down* through the content, absorbed in
 * it. Flips back to false the moment they scroll up (or return near the top). Purely
 * event-driven off framer-motion's scroll position: no scroll listener, no timer.
 *
 * The mobile bar reads this to get out of the way while they're vibing — dimming down
 * the page and coming back the instant they reach for it by scrolling up. */
export const useVibing = () => {
    const { scrollY } = useScroll()
    const [vibing, setVibing] = useState(false)

    useMotionValueEvent(scrollY, "change", (latest) => {
        if (latest <= REVEAL_ABOVE) {
            setVibing(false)
            return
        }
        const diff = latest - (scrollY.getPrevious() ?? 0)
        if (diff > DELTA) setVibing(true)
        else if (diff < -DELTA) setVibing(false)
    })

    return vibing
}
