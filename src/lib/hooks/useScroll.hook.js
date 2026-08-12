"use client"

import { useEffect, useRef, useState } from "react"
import { animate, useMotionValue, useMotionValueEvent, useScroll, useTransform } from "motion/react"

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

/* -------------------------------------------------------------------------- */
/* Pull to refresh                                                            */
/* -------------------------------------------------------------------------- */

/* How far the finger travels before a release triggers a refresh. */
const PULL_THRESHOLD = 72
/* The most the content is allowed to be dragged down — past this the pull is capped. */
const PULL_MAX = 96
/* Finger-to-content ratio: the content trails the finger so the drag feels rubbery. */
const PULL_RESISTANCE = 0.5
/* Ignore the first few pixels so a tap or a mostly-horizontal swipe isn't claimed. */
const PULL_SLOP = 6
/* One spring for both the snap-back and the settle-to-spinner, so it always feels the same. */
const PULL_SPRING = { type: "spring", stiffness: 500, damping: 40 }

/* Instagram-style pull-to-refresh, built by hand rather than leaning on the browser's
 * native overscroll: globals.css pins `overscroll-behavior: none` (no rubber-band, no
 * built-in reload) precisely so this can own the gesture and behave the same in a plain
 * browser and in the Capacitor WebView, where the native pull-to-refresh doesn't exist.
 *
 * Touch listeners hang off the window (not React's synthetic events) so `touchmove` can
 * be non-passive and call preventDefault — the only way to stop the page/WebView from
 * scrolling or bouncing while we drag. It only claims the gesture when the page is at the
 * very top, the drag is clearly downward, and no overlay is locking the scroll; anything
 * else is handed straight back to the scroller (or a horizontal carousel).
 *
 * Returns motion values for the caller to bind: `y` translates the content (and the
 * loader that rides above it), `progress` (0→1 across the threshold) drives the loader's
 * fade/scale, and `refreshing` reports the in-flight state. */
export const usePullToRefresh = (onRefresh) => {
    const y = useMotionValue(0)
    const progress = useTransform(y, [0, PULL_THRESHOLD], [0, 1], { clamp: true })
    const [refreshing, setRefreshing] = useState(false)

    /* Kept in refs so the window listeners (attached once) always see the latest callback
     * and never fire mid-refresh, without re-binding on every render. */
    const onRefreshRef = useRef(onRefresh)
    onRefreshRef.current = onRefresh
    const refreshingRef = useRef(false)

    useEffect(() => {
        let startX = 0
        let startY = 0
        let tracking = false /* a touch began at the top, gesture not yet decided */
        let active = false /* we've committed to owning a downward pull */

        const reset = () => {
            tracking = false
            active = false
        }

        const onStart = (e) => {
            if (refreshingRef.current || e.touches.length !== 1) return
            /* An overlay owns the screen, or the page is scrolled — not our gesture. */
            if (document.documentElement.classList.contains("scroll-locked")) return
            if (window.scrollY > 0) return
            startX = e.touches[0].clientX
            startY = e.touches[0].clientY
            tracking = true
            active = false
        }

        const onMove = (e) => {
            if (!tracking || refreshingRef.current) return
            const dx = e.touches[0].clientX - startX
            const dy = e.touches[0].clientY - startY

            if (!active) {
                if (Math.abs(dx) < PULL_SLOP && Math.abs(dy) < PULL_SLOP) return
                /* Only claim a clear downward, vertical drag that's still at the top; a
                 * scroll-up, a scroll that's already moved the page, or a horizontal swipe
                 * (carousel) all go back to the browser untouched. */
                if (dy <= 0 || window.scrollY > 0 || Math.abs(dx) > Math.abs(dy)) {
                    reset()
                    return
                }
                active = true
            }

            /* Own the drag: hold the page still and rubber-band the content down instead. */
            e.preventDefault()
            y.set(Math.min(dy * PULL_RESISTANCE, PULL_MAX))
        }

        const onEnd = () => {
            if (refreshingRef.current) return
            const committed = active
            const pulled = y.get()
            reset()
            if (!committed) return

            if (pulled >= PULL_THRESHOLD) {
                /* Settle to the spinner's resting spot and hold it there for the refresh. */
                refreshingRef.current = true
                setRefreshing(true)
                animate(y, PULL_THRESHOLD, PULL_SPRING)
                Promise.resolve(onRefreshRef.current?.()).finally(() => {
                    refreshingRef.current = false
                    setRefreshing(false)
                    animate(y, 0, PULL_SPRING)
                })
            } else {
                /* Not far enough — snap back with no refresh. */
                animate(y, 0, PULL_SPRING)
            }
        }

        window.addEventListener("touchstart", onStart, { passive: true })
        window.addEventListener("touchmove", onMove, { passive: false })
        window.addEventListener("touchend", onEnd, { passive: true })
        window.addEventListener("touchcancel", onEnd, { passive: true })
        return () => {
            window.removeEventListener("touchstart", onStart)
            window.removeEventListener("touchmove", onMove)
            window.removeEventListener("touchend", onEnd)
            window.removeEventListener("touchcancel", onEnd)
        }
    }, [y])

    return { y, progress, refreshing }
}
