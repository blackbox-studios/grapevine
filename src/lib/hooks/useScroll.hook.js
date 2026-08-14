"use client"

import { useEffect, useRef, useState } from "react"
import { animate, useMotionValue, useMotionValueEvent, useScroll as useMotionScroll, useTransform } from "motion/react"

import { useScroll } from "@/lib/providers/Scroll"
import { haptic } from "@/lib/native"

/* Everything scroll-related, in one place. The app scrolls a fixed, viewport-height
 * container in the shell (see ScrollProvider) rather than the document, so these all
 * read/act on that container's node: framer-motion's useScroll is pointed at it via
 * `container`, and the pull gesture reads its `scrollTop` and rides its own touch
 * listeners. `scrollToTop` lives on the provider, since it needs the same ref. */

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
    const { scrollRef } = useScroll()
    const { scrollY } = useMotionScroll({ container: scrollRef })
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
 * native overscroll: the scroll container pins `overscroll-behavior: none` (no
 * rubber-band, no built-in reload) precisely so this can own the gesture and behave the
 * same in a plain browser and in the Capacitor WebView, where the native pull-to-refresh
 * doesn't exist.
 *
 * Touch listeners hang off the container (not React's synthetic events) so `touchmove`
 * can be non-passive and call preventDefault — the only way to stop the container from
 * scrolling or bouncing while we drag. It only claims the gesture when the container is
 * at the very top and the drag is clearly downward; anything else is handed straight back
 * to the scroller (or a horizontal carousel). Because the listeners live on the container
 * and an overlay is a separate fixed layer above it, a gesture on an open overlay never
 * reaches this.
 *
 * Returns motion values for the caller to bind: `y` translates the content (and the
 * loader that rides above it), `progress` (0→1 across the threshold) drives the loader's
 * fade/scale, and `refreshing` reports the in-flight state. */
export const usePullToRefresh = (onRefresh) => {
    const { scrollRef } = useScroll()
    const y = useMotionValue(0)
    const progress = useTransform(y, [0, PULL_THRESHOLD], [0, 1], { clamp: true })
    const [refreshing, setRefreshing] = useState(false)

    /* Kept in refs so the container listeners (attached once) always see the latest
     * callback and never fire mid-refresh, without re-binding on every render. */
    const onRefreshRef = useRef(onRefresh)
    onRefreshRef.current = onRefresh
    const refreshingRef = useRef(false)

    useEffect(() => {
        const node = scrollRef.current
        if (!node) return

        let startX = 0
        let startY = 0
        let tracking = false /* a touch began at the top, gesture not yet decided */
        let active = false /* we've committed to owning a downward pull */
        let armed = false /* pulled past the threshold — a release now would refresh */

        const reset = () => {
            tracking = false
            active = false
            armed = false
        }

        const onStart = (e) => {
            if (refreshingRef.current || e.touches.length !== 1) return
            /* The container is scrolled — not our gesture. */
            if (node.scrollTop > 0) return
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
                 * scroll-up, a scroll that's already moved the container, or a horizontal
                 * swipe (carousel) all go back to the browser untouched. */
                if (dy <= 0 || node.scrollTop > 0 || Math.abs(dx) > Math.abs(dy)) {
                    reset()
                    return
                }
                active = true
            }

            /* Own the drag: hold the container still and rubber-band the content down instead. */
            e.preventDefault()
            const pulled = Math.min(dy * PULL_RESISTANCE, PULL_MAX)
            y.set(pulled)

            /* A single tap the instant the pull crosses the trigger point — so the reader feels
             * that letting go now will refresh, the same notch iOS gives. Latches on `armed` so
             * it fires once per crossing, not on every touchmove past the threshold. */
            if (!armed && pulled >= PULL_THRESHOLD) {
                armed = true
                haptic()
            } else if (armed && pulled < PULL_THRESHOLD) {
                armed = false
            }
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

        node.addEventListener("touchstart", onStart, { passive: true })
        node.addEventListener("touchmove", onMove, { passive: false })
        node.addEventListener("touchend", onEnd, { passive: true })
        node.addEventListener("touchcancel", onEnd, { passive: true })
        return () => {
            node.removeEventListener("touchstart", onStart)
            node.removeEventListener("touchmove", onMove)
            node.removeEventListener("touchend", onEnd)
            node.removeEventListener("touchcancel", onEnd)
        }
    }, [y, scrollRef])

    return { y, progress, refreshing }
}

/* -------------------------------------------------------------------------- */
/* Infinite scroll                                                            */
/* -------------------------------------------------------------------------- */

/* Fetch the next page before the reader hits the end. Rides framer-motion's scroll
 * position on the shell's scroll container (the same container everything else here reads):
 * `scrollYProgress` runs 0→1 over the scrollable range, so crossing `threshold` means the
 * reader is within the last stretch of what's loaded, and it's time to page in more.
 *
 * `onLoadMore` is expected to be a no-op when there's nothing to fetch or a fetch is
 * already in flight (the feed store guards both), so this can fire freely while scrolling
 * through the trigger zone. Pass `enabled: false` to stop paging once the list is exhausted. */
export const useInfiniteScroll = (onLoadMore, { enabled = true, threshold = 0.8 } = {}) => {
    const { scrollRef } = useScroll()
    const { scrollYProgress } = useMotionScroll({ container: scrollRef })

    /* Ref so the event handler always sees the latest callback and `enabled` without
     * re-subscribing; the guard lives in the store, so firing repeatedly here is cheap. */
    const onLoadMoreRef = useRef(onLoadMore)
    onLoadMoreRef.current = onLoadMore

    useMotionValueEvent(scrollYProgress, "change", (progress) => {
        if (enabled && progress >= threshold) onLoadMoreRef.current?.()
    })
}
