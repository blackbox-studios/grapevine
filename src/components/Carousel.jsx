"use client"

import { useEffect, useRef, useState } from "react"
import {
    AnimatePresence,
    animate,
    motion,
    useMotionValue,
    useMotionValueEvent,
} from "motion/react"

import { usePinchZoom } from "@/components/PinchZoom"
import CycleLeft from "@/assets/svg/icons/cycle-left.svg"
import CycleRight from "@/assets/svg/icons/cycle-right.svg"
import { appPath, cn } from "@/lib/utils"

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/* Snap/scale spring — quick and lightly damped, matching Instagram's feel. */
const SPRING = { type: "spring", stiffness: 500, damping: 42 }

/* -------------------------------------------------------------------------- */
/* Dot indicator                                                              */
/*                                                                            */
/* Recreates Instagram's paging dots exactly. Three dots are full-size; the   */
/* "full window" begins at start = clamp(active-2, 0, n-3) and is centred on   */
/* windowCenter = start+1. A dot's scale is a step function of its distance    */
/* from that centre: 0–1 → full, 2 → small, 3 → tiny, beyond → hidden. The     */
/* whole strip translates (it does not re-centre), so as you advance the empty */
/* space slides from the right edge to the left — just like the real thing.    */
/* For small counts (≤ MAX_VISIBLE-2) every dot stays full-size.               */
/* -------------------------------------------------------------------------- */
const DOT = 6 // full dot diameter, px
const PITCH = 10 // per-dot slot width, px (dot + gap)
const MAX_VISIBLE = 7 // dots across the viewport before windowing kicks in
const SMALL = 0.66
const TINY = 0.4

/* Screenshot-matched colors. Active is Instagram's periwinkle-blue; inactive is
 * a neutral gray that reads on both light and dark page backgrounds. */
const ACTIVE_COLOR = "#4d6bff"
const INACTIVE_COLOR = "#9ca3af"

const CarouselDots = ({ count, active }) => {
    if (count <= 1) return null

    const windowed = count > MAX_VISIBLE - 2
    const start = clamp(active - 2, 0, Math.max(0, count - 3))
    const center = windowed ? start + 1 : (count - 1) / 2
    const viewport = (windowed ? MAX_VISIBLE : count) * PITCH
    const trackX = viewport / 2 - (center * PITCH + DOT / 2)

    const scaleFor = (i) => {
        if (i === active) return 1 // the active dot is always full-size
        if (!windowed) return 1
        const off = Math.abs(i - center)
        if (off <= 1) return 1
        if (off <= 2) return SMALL
        if (off <= 3) return TINY
        return 0
    }

    return (
        <div className="flex justify-center pt-3">
            <div
                className="relative overflow-hidden"
                style={{ width: viewport, height: DOT }}
            >
                <motion.div
                    className="absolute left-0 top-0 h-full"
                    style={{ width: count * PITCH }}
                    animate={{ x: trackX }}
                    transition={SPRING}
                >
                    {Array.from({ length: count }).map((_, i) => (
                        <motion.span
                            key={i}
                            className="absolute top-1/2 rounded-full"
                            style={{
                                left: i * PITCH,
                                width: DOT,
                                height: DOT,
                                marginTop: -DOT / 2,
                            }}
                            initial={false}
                            animate={{
                                scale: scaleFor(i),
                                backgroundColor:
                                    i === active ? ACTIVE_COLOR : INACTIVE_COLOR,
                            }}
                            transition={SPRING}
                        />
                    ))}
                </motion.div>
            </div>
        </div>
    )
}

/* -------------------------------------------------------------------------- */
/* Carousel                                                                   */
/* -------------------------------------------------------------------------- */
/* Desktop: arrows are always visible. Mobile: they follow the same swipe timer
 * as the count pill (visible while interacting, fading out shortly after). */
const Arrow = ({ dir, onClick, visible }) => {
    const Glyph = dir === "left" ? CycleLeft : CycleRight
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={dir === "left" ? "Previous image" : "Next image"}
            className={cn(
                "absolute top-1/2 size-6 -translate-y-1/2 cursor-pointer drop-shadow-sm transition-opacity sm:opacity-100",
                visible ? "opacity-100" : "opacity-0",
                dir === "left" ? "left-2" : "right-2",
            )}
        >
            <Glyph className="size-full" />
        </button>
    )
}

/* `bare` (used inside the desktop comments modal): drop the feed card's border and
 * rounding, fill the parent's height, and overlay the paging dots on the image so
 * they don't add height — letting the modal size itself to the media.
 *
 * `onImageClick` (feed card): fires when the media is *tapped* rather than dragged
 * or paged. Framer suppresses the click that follows a drag, and the arrows are
 * siblings of the track (their clicks don't bubble here), so this only runs on a
 * genuine tap — used to open the post (modal on desktop, `/p/:id` on mobile). */
const Carousel = ({ images, bare = false, zoomable = false, onImageClick }) => {
    const n = images.length

    const [index, setIndex] = useState(0)
    const [active, setActive] = useState(0) // live index while dragging
    const [width, setWidth] = useState(0)
    const [interacting, setInteracting] = useState(false)

    const containerRef = useRef(null)
    const hideTimer = useRef(null)
    const x = useMotionValue(0)

    /* Pinch-to-peek on the *current* slide (touch only). A two-finger gesture co-opts the same
     * fingers the swipe uses, so `pinching` tells onDragEnd to snap back to this slide instead
     * of paging when the gesture unwinds. `active` is read live, so the lifted image is always
     * the one on screen. */
    const pinching = useRef(false)
    const pinchOverlay = usePinchZoom(
        containerRef,
        () => {
            if (!zoomable) return null
            const img = containerRef.current?.querySelectorAll("img")?.[active]
            if (!img) return null
            return { src: img.currentSrc || img.src, rect: img.getBoundingClientRect() }
        },
        (on) => {
            if (on) pinching.current = true
        },
    )

    /* Track the container width so drag distances/constraints stay in px. */
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const measure = () => setWidth(el.clientWidth)
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    /* Snap the track to the settled index whenever it (or the width) changes. */
    useEffect(() => {
        if (!width) return
        const controls = animate(x, -index * width, SPRING)
        return () => controls.stop()
    }, [index, width, x])

    /* Derive the live "current" slide from the track position so the dots and
     * pill follow the finger and flip at the halfway point. */
    useMotionValueEvent(x, "change", (latest) => {
        if (!width) return
        setActive(clamp(Math.round(-latest / width), 0, n - 1))
    })

    useEffect(() => () => clearTimeout(hideTimer.current), [])

    const goTo = (i) => setIndex(clamp(i, 0, n - 1))

    const showPill = () => {
        clearTimeout(hideTimer.current)
        setInteracting(true)
    }
    const hidePillSoon = () => {
        clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(() => setInteracting(false), 2000)
    }

    const onDragEnd = (_e, info) => {
        /* A pinch owned these fingers — don't let the tail of it page the carousel. */
        if (pinching.current) {
            pinching.current = false
            animate(x, -index * width, SPRING)
            hidePillSoon()
            return
        }
        const offset = info.offset.x
        const velocity = info.velocity.x
        const threshold = width * 0.2
        if ((offset < -threshold || velocity < -500) && index < n - 1) goTo(index + 1)
        else if ((offset > threshold || velocity > 500) && index > 0) goTo(index - 1)
        else animate(x, -index * width, SPRING) // snap back
        hidePillSoon()
    }

    return (
        <div className={cn(bare && "relative h-full")}>
            <div
                ref={containerRef}
                className={cn(
                    "group relative cursor-grab overflow-hidden bg-black active:cursor-grabbing",
                    /* Feed card: flush edge-to-edge on mobile, a rounded/bordered card from md
                     * (see Feed's media breakout). `bare` fills its parent in the post modal. */
                    bare ? "h-full" : "rounded-none border-0 md:rounded-lg md:border",
                )}
            >
                <motion.div
                    className={cn("flex", onImageClick && "cursor-pointer")}
                    style={{ x }}
                    drag="x"
                    dragConstraints={{ left: -(n - 1) * width, right: 0 }}
                    dragElastic={0.12}
                    onDragStart={showPill}
                    onDragEnd={onDragEnd}
                    onClick={onImageClick}
                >
                    {images.map((src, i) => (
                        <div
                            key={i}
                            className="aspect-square w-full shrink-0 select-none bg-black"
                        >
                            <img
                                src={appPath(src)}
                                alt=""
                                draggable={false}
                                className="pointer-events-none h-full w-full object-contain"
                            />
                        </div>
                    ))}
                </motion.div>

                {index > 0 && (
                    <Arrow
                        dir="left"
                        visible={interacting}
                        onClick={() => goTo(index - 1)}
                    />
                )}
                {index < n - 1 && (
                    <Arrow
                        dir="right"
                        visible={interacting}
                        onClick={() => goTo(index + 1)}
                    />
                )}

                {/* Mobile-only count pill: fades in while swiping, out after. */}
                <AnimatePresence>
                    {interacting && (
                        <motion.div
                            className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-1 text-xs tabular-nums text-white sm:hidden"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            {active + 1}/{n}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {bare ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
                    <CarouselDots count={n} active={active} />
                </div>
            ) : (
                <CarouselDots count={n} active={active} />
            )}

            {pinchOverlay}
        </div>
    )
}

export default Carousel
