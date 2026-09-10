"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useMotionValue } from "motion/react"

import Icon from "@/components/Icon"
import Linkify from "@/components/Linkify"
import Transition from "@/components/Transition"
import Skeleton from "@/components/Skeleton"
import { Avatar } from "@/components/Widgets"
import { Button } from "@/components/ui/button"
import { MAX_MESSAGE_LENGTH } from "@/lib/constants"
import { displayName } from "@/lib/name"
import { useUser } from "@/lib/store/auth/hook"
import { useConversation } from "@/lib/store/messages/hook"
import { useOpenProfile } from "@/lib/store/profile/hook"
import { cn } from "@/lib/utils"

/* One conversation: the bubbles, the composer, and the message-request gate. A slide
 * route (`/inbox/c/:id`) — a thread slides in over the inbox exactly as the phone's
 * own messages app pushes one, and Android's back gesture returns from it for free.
 *
 * ── The two animations the surface is really about ───────────────────────────
 *
 * **Scroll lag.** iMessage's bubbles do not move rigidly with the scroll: each trails
 * it and settles back when it stops, and how far a row trails depends on where it sits
 * — which is what makes the rail feel like objects being dragged rather than a texture
 * sliding. One loop measures how fast the thread is moving and integrates a spring per
 * row against it; at rest every row is at exactly zero and the loop is not running.
 *
 * Three things about it are easy to lose and invisible in a diff:
 *
 *  - **The trail is ordered by direction, not by row.** Rows nearer the leading edge
 *    trail furthest — the bottom while scrolling down, the top while scrolling up —
 *    and the two ends swap the instant the reader reverses. It is therefore a function
 *    of viewport position and scroll sign, not a per-row constant, which is why every
 *    row is driven from the rail rather than owning a spring of its own.
 *  - **It reads the content's rendered position, not `scrollTop`.** At either end the
 *    browser rubber-bands: the content visibly moves while `scrollTop` sits pinned and
 *    reports nothing, so a scroll-offset reading goes rigid exactly where the effect
 *    is most visible.
 *  - **Amplitude carries the trail, not spring rate.** See `LAG_LEADING_EDGE`.
 *
 * **The send.** A new bubble springs up out of the composer's corner as the rail
 * scrolls to meet it, and the timestamp and receipt around it fade in rather than
 * appearing. Only rows that arrived after the thread was opened animate at all.
 *
 * ── The request gate ─────────────────────────────────────────────────────────
 *
 * A thread someone opened *to* the viewer arrives as a request: the sender's face is
 * blurred in the header, what they wrote is readable (the decision needs it), and in
 * the composer's place stand Block / Delete / Accept — Signal's pattern, with its
 * promise kept by the server: nothing tells the sender the request was even seen
 * until Accept, because accepting is what writes the first observable fact. */

/* "Today 1:43 AM" / "Yesterday 11:34 PM" / "Mon, Sep 7 at 9:12 AM" — the centered
 * stamp iMessage drops wherever the conversation paused. */
const stamp = (iso) => {
    const at = new Date(iso)
    const now = new Date()
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000)
    const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })

    if (days <= 0) return `Today ${time}`
    if (days === 1) return `Yesterday ${time}`
    return `${at.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at ${time}`
}

/* A pause long enough to deserve a stamp between two messages. */
const STAMP_GAP_MS = 60 * 60 * 1000

/* How far a bubble may trail the rail, in pixels.
 *
 * **A backstop against a fling, not a working value.** Everything below it is
 * proportional to speed, so a rail that spends its time pinned here has stopped
 * responding to velocity at all — which does not read as "capped", it reads as the
 * effect being flat. Divide it by `LAG_DIVISOR` for the speed at which that happens,
 * and keep that number above anything a hand actually produces.
 *
 * **It is also the height reserved at the foot of the rail**, and the two are the same
 * constant rather than two that must agree: a transform counts toward a scroll
 * container's scrollable overflow, so a bubble trailing past the last row genuinely
 * grows the content, and the browser clamps `scrollTop` back when it springs home —
 * a hard jump at the moment a fast scroll reaches the bottom. Reserving the trail's own
 * ceiling means no row can translate past the content's edge, so `scrollHeight` holds
 * still and there is nothing to clamp. The cost is real and is the reason this is not
 * simply enormous: every pixel here is also empty space above the composer. */
const MAX_LAG = 64

/* Clear air between the floating header and the first thing under it, which is usually a
 * date stamp sitting hard against the header's hairline without it. */
const RAIL_TOP_GAP = 12

/* How tall the composer grows before it scrolls instead. **One number, read by both the
 * inline style and the resize handler**: a CSS cap below the JS one puts a scrollbar on the
 * field for the pixels between them, while the box is still visibly growing. */
const COMPOSER_MAX_HEIGHT = 132

/* The width the send button claims from the field when it appears: the button itself plus
 * the gap it needs from the field. The row has no `gap` of its own, so that space is inside
 * the animated width and collapses with it. */
const SEND_SLOT_WIDTH = 44

/* Past this, in px/s, the rail did not scroll — something moved it. A hard flick on a
 * phone peaks around 6000; pinning a thread to its foot on open is ten times that. */
const MAX_VELOCITY = 12000

/* px/s of scroll per px of trail — the sensitivity dial, and the number to change if
 * the rail feels dead or overwrought.
 *
 * Set against measured velocities rather than by eye. An unhurried scroll runs 600-900
 * px/s, an ordinary one 1500-2500, and a hard flick 3000-5000; this puts those at
 * roughly 15px, 30-50px, and the clamp. **Check `MAX_LAG / LAG_DIVISOR` after changing
 * either** — that quotient is the speed past which the rail stops answering the hand,
 * and when it fell to 960 px/s the effect went flat above a slow scroll while every
 * number here still looked reasonable on its own. */
const LAG_DIVISOR = 50

/* How much of the rail's lag a row actually takes, by where it sits along the
 * direction of travel. A row at the **leading** edge — the bottom while scrolling
 * down, the top while scrolling up — trails the full amount; the trailing edge takes
 * a small fraction of it and is nearly pinned. The two swap the instant the reader reverses, which is the part that
 * makes the rail feel like it is being dragged rather than merely offset.
 *
 * **The gap between these two is what sets how far apart two messages can pull**, so
 * it is the number to change for that, and it is a separate question from how much the
 * rail lags overall (`LAG_DIVISOR`). Widening it holds the leading edge where it is and
 * pins the trailing edge harder.
 *
 * **Amplitude is the lever here, not spring rate.** These springs chase a displacement
 * that is handed to them, so a *stiffer* one arrives at a larger offset and a slacker
 * one lags behind at a smaller one — the exact opposite of the intuition that a loose
 * spring trails further, which holds only when a spring is being dragged by its
 * anchor. Asking for more trail therefore means asking for more trail. */
const LAG_TRAILING_EDGE = 0.15
const LAG_LEADING_EDGE = 1

/* A gentler second-order effect on top: the leading edge is also a little slower to
 * come back, so the spread widens as a flick decays instead of shrinking with it. Kept
 * mild, or it cancels the amplitude difference while the scroll is speeding up. */
const STIFFNESS_TRAILING_EDGE = 190
const STIFFNESS_LEADING_EDGE = 115

/* Slightly under critical. At exactly 1 a spring takes the shortest path to rest, which
 * means it is still travelling at a good rate when it arrives and then simply stops —
 * and that arrival is what reads as a snap, however small the rest threshold is. A
 * little under lets it ease past and drift back over a few frames, which is what makes
 * the settle feel like weight coming to rest instead of an animation ending. Much below
 * this and the overshoot becomes a visible bounce, which on a column of text is wobble. */
const DAMPING_RATIO = 0.72

/* When a row counts as arrived, in px and px/s — motion's `restDelta`/`restSpeed` by
 * another name, and deliberately far below either default.
 *
 * The loop zeroes a row the moment it falls inside these, so whatever offset it still
 * held is surrendered in one frame. Anything a reader can see there is a snap at the end
 * of the settle, which is the most visible part of the whole effect because it is the
 * part they are looking straight at. A thousandth of a pixel cannot be seen at any
 * density; the cost of waiting for it is a few more frames of a loop that is already
 * running, on rows that are no longer moving. */
const REST_DELTA = 0.002
const REST_SPEED = 0.01

/* One row of the rail, and the thing the scroll engine actually moves.
 *
 * **Everything the row contains travels together** — the timestamp above it, the
 * bubble, and the "Delivered" beneath — because they are one utterance to the reader
 * and a stamp that stayed put while the message it labels slid away reads as the text
 * having come loose from its own chrome. It is also why the row rather than the bubble
 * is what registers with the rail: the lag is a property of a position in the
 * conversation, and the position is the row's.
 *
 * The row owns its motion value but not its motion. It hands the value and its element
 * to `register`, and the rail drives every row from one loop — how far a row trails
 * depends on where it sits and which way the reader is going, and a row cannot know
 * either about itself. */
const LagRow = ({ register, className, children }) => {
    const ref = useRef(null)
    const y = useMotionValue(0)

    useEffect(() => register({ ref, y }), [register, y])

    return (
        <motion.div ref={ref} style={{ y }} className={className}>
            {children}
        </motion.div>
    )
}

/* The centred date a conversation is broken up by, and the receipt under the last thing
 * you sent. Both fade rather than appear: they are the app annotating the conversation
 * after the fact, and a label that snaps into existence beside a bubble that eased into
 * place is the one part of the exchange that looks mechanical. */
const Annotation = ({ className, children }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className={className}
    >
        {children}
    </motion.div>
)

/* The bubble itself.
 *
 * `entering` plays the send: it rises and scales out of the composer's corner, which is
 * the gesture iOS uses to tie the message to the box it came from. Only rows that
 * arrived after the thread opened get it — fifty bubbles assembling themselves on open
 * is a loading screen.
 *
 * It carries no `layout` prop, and must not: a layout projection measures against the
 * viewport, sees its parent's lag translation as its own box moving, and issues a
 * corrective transform that cancels exactly the offset the scroll engine exists to
 * produce. */
const Bubble = ({ item, mine, tail, entering }) => (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <motion.div
            initial={entering ? { opacity: 0, y: 26, scale: 0.82 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 28, mass: 0.9 }}
            style={{ originX: mine ? 1 : 0, originY: 1 }}
            className={cn(
                /* A share of the rail on a phone, but a *measure* on a desktop: the
                   pane is wide enough that 78% of it is a paragraph running the width
                   of the screen, which is unreadable and stops looking like a message. */
                "max-w-[78%] md:max-w-[min(65%,32rem)] rounded-[18px] px-4 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap",
                mine ? "bg-secondary text-secondary-foreground" : "bg-muted text-foreground",
                tail && (mine ? "bubble-tail-out" : "bubble-tail-in"),
                item.failed && "opacity-60",
            )}
        >
            <Linkify text={item.text} />
        </motion.div>
    </div>
)

/* What stands in for a run of messages this device cannot read.
 *
 * Centred, quiet, and glyph-led, matching how every other app states something that
 * happened *to* the conversation rather than in it. It says why rather than what
 * failed, because nothing failed: the keys that could read these belong to a device
 * that is not this one, which is the guarantee working, not a fault to report.
 *
 * The count is deliberately absent from the sentence. It is knowable (the envelopes are
 * there) but it is not useful, and a number invites the reader to wonder what they are
 * missing from someone they can simply ask. */
const Withheld = () => (
    <div className="flex items-center justify-center gap-1.5 px-8 py-1 text-center">
        <Icon size="xs" className="shrink-0 text-muted-foreground">lock</Icon>
        <span className="text-xs leading-snug text-muted-foreground">
            For your privacy, messages sent before you signed in on this device can&apos;t be
            shown here.
        </span>
    </div>
)

/* A live height for an element that floats over the rail. Observed rather than read once,
 * because both of them resize after their first paint. Reports 0 while unmounted, which is
 * what a caller insetting for it wants. */
const useMeasuredHeight = (ref) => {
    const [height, setHeight] = useState(0)

    useLayoutEffect(() => {
        const el = ref.current
        if (!el) {
            setHeight(0)
            return
        }
        const measure = () => setHeight(el.offsetHeight)
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(el)
        return () => observer.disconnect()
    }, [ref])

    return height
}

/* The rail: stamps, grouped bubbles, Delivered, and the scroll-spring plumbing. */
const Rail = ({ items, viewerId, hasOlder, loadingOlder, onLoadOlder, topInset, bottomInset }) => {
    const railRef = useRef(null)

    /* Every row's offset, integrated in one loop.
     *
     * ── The target ───────────────────────────────────────────────────────────
     *
     * How fast the thread is actually moving on screen, in the direction it is moving.
     * **The sign is the part to get right:** scrolling down moves the content up, so a
     * bubble that has not kept up sits *lower* than its resting place — a positive `y`.
     * Inverted, the rail leads the scroll instead of trailing it, which does not read
     * as wrong so much as read as nothing.
     *
     * It measures the content's rendered position rather than `scrollTop`, for the
     * reason in the header.
     *
     * ── Why every row is driven from here ────────────────────────────────────
     *
     * How far a row trails is a function of its position in the viewport and the sign
     * of the scroll (see the header), so it changes every frame and belongs to no row
     * in particular. A `useSpring` per bubble is configured at its call site and cannot
     * be told a new target amplitude and stiffness per frame; integrating by hand costs
     * one loop for the whole rail and makes both per-row terms ordinary arithmetic.
     *
     * Row positions are cached once per gesture rather than measured per frame: the
     * layout does not move while a gesture is in flight, and reading a box per row per
     * frame would. */
    const contentRef = useRef(null)
    const springsRef = useRef(null)
    springsRef.current ??= new Set()
    const orderedRef = useRef([])

    const register = useCallback((entry) => {
        entry.x = 0
        entry.v = 0
        springsRef.current.add(entry)
        return () => {
            springsRef.current.delete(entry)
            /* Out of the ordered list too, not just the registry: the stretch floor
             * carries each row's offset down to the next one, so a row left behind by
             * an unmount would go on pinning everything below it to a position nothing
             * on screen is holding. */
            const at = orderedRef.current.indexOf(entry)
            if (at !== -1) orderedRef.current.splice(at, 1)
        }
    }, [])

    useEffect(() => {
        const rail = railRef.current
        const content = contentRef.current
        if (!rail || !content) return

        let lastTop = content.getBoundingClientRect().top
        let lastAt = performance.now()
        let idle = 0
        let frame = 0

        /* Each row's layout position **within the rail's scrollable content**, taken
         * once per gesture.
         *
         * Derived from the rail's own box rather than from `offsetTop`, which is
         * measured against the nearest positioned ancestor — here the slide surface,
         * one level up and past the header. That offset silently shifts every row down
         * the viewport, which does not look like a bug so much as like the effect not
         * working: most rows clamp to the far end and get identical springs, and the
         * rail goes back to moving as one plate. */
        const measure = () => {
            const railTop = rail.getBoundingClientRect().top
            const scrolled = rail.scrollTop
            const ordered = []
            for (const entry of springsRef.current) {
                const el = entry.ref.current
                if (!el) continue
                const box = el.getBoundingClientRect()
                entry.top = box.top - railTop + scrolled
                entry.height = box.height
                ordered.push(entry)
            }
            /* Sorted top to bottom, which the stretch-only floor below depends on —
             * the registration Set is in mount order, and that is not the same thing
             * once a page of older messages has been prepended. */
            ordered.sort((a, b) => a.top - b.top)
            orderedRef.current = ordered
        }

        const rest = () => {
            for (const entry of springsRef.current) {
                entry.x = 0
                entry.v = 0
                entry.y.set(0)
            }
        }

        const tick = () => {
            const now = performance.now()
            const top = content.getBoundingClientRect().top
            /* Guard the first sample of a burst, where `now - lastAt` can be 0, and cap
             * it so a dropped frame integrates as one long step rather than exploding. */
            const dt = Math.min(Math.max(now - lastAt, 1), 50)
            /* Negated: the content's box moves *up* as the reader scrolls down. */
            const velocity = ((lastTop - top) / dt) * 1000
            lastTop = top
            lastAt = now

            /* **A jump is not a scroll.** Pinning to the foot on open, and restoring
             * position after loading older messages, move the rail by hundreds of
             * pixels in one frame — an order of magnitude past anything a finger
             * produces. Left alone that flings every bubble to the clamp and settles
             * them in front of the reader, so it is read as what it is and asks for no
             * lag at all. Rejecting by magnitude rather than by arming a flag around
             * the scroll keeps this independent of effect ordering, which is what it
             * has to be: React runs effects twice in development, and a flag armed in
             * one of them is a flag the second pass can quietly leave unset. */
            const jumped = Math.abs(velocity) > MAX_VELOCITY
            const target = jumped
                ? 0
                : Math.max(-MAX_LAG, Math.min(MAX_LAG, velocity / LAG_DIVISOR))

            const seconds = dt / 1000
            const height = rail.clientHeight || 1
            const scrolled = rail.scrollTop
            /* Ties on the way down: a stalled rail keeps whichever end was loose. */
            const down = velocity >= 0
            let moving = false

            /* **The rail stretches; it never compresses.** The gap between two bubbles
             * is `layout gap + (lower.x - upper.x)`, so holding `x` non-decreasing from
             * top to bottom is exactly the promise that no two messages are ever drawn
             * closer together than the layout puts them. The reference has that as a
             * hard floor rather than a soft one, and the difference is visible: bubbles
             * bunching up mid-flick reads as the list buckling.
             *
             * The amplitude gradient already produces a non-decreasing `x` in both
             * directions, so in practice this floor is rarely the thing deciding a
             * frame — but "rarely" is the wrong guarantee for something a reader would
             * notice immediately, and the per-row stiffness spread is enough to invert
             * two neighbours during a sharp reversal. A row that would cross the one
             * above it is parked against it and inherits its speed, so the pair rides
             * out the rest of the frame together instead of fighting a wall. */
            let floorX = -Infinity
            let floorV = -Infinity

            for (const entry of orderedRef.current) {
                if (entry.top === undefined) continue

                /* 0 at the top of the viewport, 1 at the bottom, then flipped so it is
                 * always "how far along the direction of travel". */
                const centre = entry.top + entry.height / 2 - scrolled
                const place = Math.max(0, Math.min(1, centre / height))
                const along = down ? place : 1 - place

                const amplitude =
                    LAG_TRAILING_EDGE + (LAG_LEADING_EDGE - LAG_TRAILING_EDGE) * along
                const stiffness =
                    STIFFNESS_TRAILING_EDGE +
                    (STIFFNESS_LEADING_EDGE - STIFFNESS_TRAILING_EDGE) * along
                const damping = 2 * Math.sqrt(stiffness) * DAMPING_RATIO

                const pull = target * amplitude
                entry.v += (stiffness * (pull - entry.x) - damping * entry.v) * seconds
                entry.x += entry.v * seconds

                if (entry.x < floorX) {
                    entry.x = floorX
                    entry.v = Math.max(entry.v, floorV)
                }
                floorX = entry.x
                floorV = entry.v

                entry.y.set(Math.round(entry.x * 1000) / 1000)

                if (Math.abs(entry.x) > REST_DELTA || Math.abs(entry.v) > REST_SPEED) {
                    moving = true
                }
            }

            /* The loop outlives the scroll: the rail can be still while the loosest
             * rows are still catching up, and stopping on velocity alone would freeze
             * them mid-offset. */
            idle = Math.abs(velocity) < 1 && !moving ? idle + 1 : 0
            if (idle > 3) {
                frame = 0
                rest()
                return
            }
            frame = requestAnimationFrame(tick)
        }

        const wake = () => {
            if (frame) return
            measure()
            lastTop = content.getBoundingClientRect().top
            lastAt = performance.now()
            idle = 0
            frame = requestAnimationFrame(tick)
        }

        /* `scroll` alone would miss the rubber band, which by definition happens when
         * scrolling has stopped changing: the touch and wheel events are what start the
         * loop for it, and the idle counter is what ends it once the spring-back has
         * finished. */
        const events = ["scroll", "wheel", "touchstart", "touchmove", "pointerdown"]
        for (const name of events) rail.addEventListener(name, wake, { passive: true })

        return () => {
            for (const name of events) rail.removeEventListener(name, wake)
            if (frame) cancelAnimationFrame(frame)
        }
    }, [])

    /* Which rows animate in: the ones that arrived *after* the thread was opened.
     *
     * **A pure comparison against the newest timestamp at mount**, not a set of ids
     * consumed as they are drawn. A consume-once check has to mutate during render, and
     * React renders twice in development — the first pass spends the flag and the
     * committed pass sees a row that has already been counted, so nothing ever
     * animates. That is the whole bug behind a sent message appearing at its final
     * position instead of rising into it, and it is invisible in production, where the
     * animation works and only development looks broken.
     *
     * Comparing timestamps also answers a question a set cannot: a page of *older*
     * messages is full of ids never seen before, and none of it should pop. */
    const openedAtRef = useRef(null)
    openedAtRef.current ??= items.length ? items[items.length - 1].at : ""
    const entering = (item) => item.at > openedAtRef.current

    /* Pinned to the foot: on open instantly, on growth smoothly — the rail is a
     * conversation, and a conversation is read at its end. */
    const count = items.length
    const openedRef = useRef(false)
    useLayoutEffect(() => {
        const rail = railRef.current
        if (!rail || count === 0) return

        rail.scrollTo({
            top: rail.scrollHeight,
            behavior: openedRef.current ? "smooth" : "auto",
        })
        openedRef.current = true
    }, [count])

    /* The rail's rows: the readable messages, and at most one notice above them.
     *
     * **A message this device has no key for is not a message with missing text**, so it
     * gets no bubble. The honest reason depends entirely on *where* it sits:
     *
     *  - **At the head of the thread** it is history from before this install existed —
     *    signing in on a new phone leaves every earlier message in that state — and one
     *    line above the conversation says so once. Drawing a bubble apiece would turn a
     *    history into a column of identical apologies.
     *  - **Anywhere else** it is not that at all. A message that arrived after this
     *    device was reachable and still would not open is a ratchet that lost its place,
     *    a prekey claimed twice, or a duplicate — a delivery fault, and rare. Those are
     *    dropped silently, because the alternative is interrupting a conversation to
     *    offer an explanation that is *false*: nothing about this device's age caused
     *    it, and saying so mid-thread is worse than saying nothing.
     *
     * So the notice can only ever be the first row, and only when the oldest messages in
     * hand are the unreadable ones. Paging in older history re-runs this, so it stays at
     * the top rather than stranding itself in the middle. */
    const rows = useMemo(() => {
        const out = []
        let leading = true
        let withheld = false

        for (const item of items) {
            if (item.text === null) {
                if (leading) withheld = true
                continue
            }
            leading = false
            out.push({ kind: "message", id: item.id, item })
        }

        if (withheld) out.unshift({ kind: "gap", id: "withheld" })
        return out
    }, [items])

    const lastMineId = useMemo(() => {
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i]
            if (row.kind === "message" && row.item.senderId === viewerId && !row.item.failed) {
                return row.item.id
            }
        }
        return null
    }, [rows, viewerId])

    return (
        <div
            ref={railRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 md:px-6"
            /* The header floats over this, so the rail starts below it and the content
               scrolls up underneath. Padding on the scroller rather than on a child: it
               is part of the scrollable box, so it scrolls away rather than pinning a
               gap at the top. */
            style={{ paddingTop: topInset + RAIL_TOP_GAP }}
        >
            {hasOlder && (
                <div className="flex justify-center pb-3">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={loadingOlder}
                        onClick={onLoadOlder}
                        className="text-muted-foreground"
                    >
                        {loadingOlder ? "Loading…" : "Show earlier messages"}
                    </Button>
                </div>
            )}

            {/* **Spacing is per row, not a uniform gap on the column**, because the
                distance between two bubbles is a fact about the pair: consecutive
                messages from one person are one utterance broken over several lines and
                sit close, and a change of speaker is a turn in the conversation and gets
                room. A single `gap` cannot say both, and set tight enough for the first
                it makes a reply look like a continuation of what it answers. */}
            {/* The reserve that keeps the scroll height fixed while the rows trail, and
                the rail's bottom breathing room — see `MAX_LAG`. Written from the
                constant rather than as a class, because a literal here that drifts from
                it reintroduces the scroll jump silently. */}
            {/* MAX_LAG is the scroll trail's own ceiling (see the constant); the inset is
                the composer floating over the foot, which the rail scrolls under. */}
            <div
                ref={contentRef}
                className="flex flex-col"
                style={{ paddingBottom: MAX_LAG + bottomInset }}
            >
                {rows.map((row, index) => {
                    if (row.kind === "gap") {
                        return (
                            <LagRow
                                key={row.id}
                                register={register}
                                className={cn(index > 0 && "mt-6", "mb-2")}
                            >
                                <Withheld />
                            </LagRow>
                        )
                    }

                    const { item } = row
                    const prevRow = rows[index - 1]
                    const nextRow = rows[index + 1]
                    const prev = prevRow?.kind === "message" ? prevRow.item : null
                    const next = nextRow?.kind === "message" ? nextRow.item : null
                    const mine = item.senderId === viewerId

                    const stamped =
                        !prev || new Date(item.at) - new Date(prev.at) > STAMP_GAP_MS
                    /* The tail marks the end of a run: the next bubble is somebody
                     * else's, far enough later to earn a stamp, or absent. */
                    const tail =
                        !next ||
                        next.senderId !== item.senderId ||
                        new Date(next.at) - new Date(item.at) > STAMP_GAP_MS
                    const continues = prev && prev.senderId === item.senderId && !stamped

                    return (
                        <LagRow
                            key={item.localId ?? item.id}
                            register={register}
                            className={cn(
                                index > 0 && (stamped ? "mt-6" : continues ? "mt-1" : "mt-4"),
                            )}
                        >
                            {stamped && (
                                <Annotation className="pb-3 text-center text-xs font-medium text-muted-foreground">
                                    {stamp(item.at)}
                                </Annotation>
                            )}
                            <Bubble
                                item={item}
                                mine={mine}
                                tail={tail}
                                entering={entering(item)}
                            />
                            {item.failed && (
                                <Annotation className="pt-1 text-right text-xs text-destructive">
                                    Not delivered
                                </Annotation>
                            )}
                            {!item.failed && !item.sending && item.id === lastMineId && (
                                <Annotation className="pt-1 pr-1 text-right text-xs font-medium text-muted-foreground">
                                    Delivered
                                </Annotation>
                            )}
                        </LagRow>
                    )
                })}
            </div>
        </div>
    )
}

/* The composer: iMessage's pill and the blue arrow that appears the moment there is
 * something to send. A textarea that grows to five lines, because messages wrap;
 * Enter sends on a keyboard, and on a phone the button is the send. */
const Composer = ({ ref, onSend, sending }) => {
    const [draft, setDraft] = useState("")
    const areaRef = useRef(null)

    /* `overflow` is hidden below the cap because `scrollHeight` is an integer and a line box
     * is not. A 24.375px line reports 24, so a box sized from it is a fraction of a pixel
     * short of its own content, and the browser draws a scrollbar for that fraction on a
     * field holding one short line. */
    const fit = useCallback(() => {
        const area = areaRef.current
        if (!area) return
        area.style.height = "auto"
        const content = area.scrollHeight
        area.style.height = `${Math.min(content, COMPOSER_MAX_HEIGHT)}px`
        area.style.overflowY = content > COMPOSER_MAX_HEIGHT ? "auto" : "hidden"
    }, [])

    /* **Sized from the draft, not from the keystroke.** Every way the text can change has
     * to resize the box, and two of them are not keystrokes: it is cleared on send, and a
     * refusal puts the words back. It is also measured again when the send button finishes
     * arriving, because the field is narrower by then and how the text wraps has changed:
     * a long message pasted into an empty box is measured at a width it is about to lose. */
    useLayoutEffect(fit, [draft, fit])

    const showSend = Boolean(draft.trim())

    const submit = async () => {
        const text = draft.trim()
        if (!text || sending) return
        setDraft("")
        const sent = await onSend(text)
        /* A refusal puts the words back rather than losing them. */
        if (!sent) setDraft(text)
    }

    return (
        <div
            ref={ref}
            /* **No footer plate; the field is the only thing drawn.** The row floats over the
                rail like the header does, so a bubble scrolling out of view passes under the
                pill and is blurred by it rather than meeting an opaque bar. Only the pill
                carries the treatment, which is why the space either side of it stays clear. */
            className="absolute inset-x-0 bottom-0 z-10 flex items-end px-3 pt-2 pb-[max(0.5rem,calc(var(--bottom-inset)-var(--keyboard-inset)))] md:px-6 md:pt-3 md:pb-4"
        >
            {/* `rounded-3xl` is half the pill's one-line height, not a softer corner than
                `rounded-full`: CSS clamps a radius to half the box, so at one line this *is*
                a pill, and a box grown to five lines keeps those same corners instead of
                becoming a stadium around a paragraph. */}
            <div className="flex min-w-0 flex-1 items-end rounded-3xl border border-border bg-background/70 px-4 py-3 backdrop-blur-md supports-backdrop-filter:bg-background/55">
                <textarea
                    ref={areaRef}
                    rows={1}
                    value={draft}
                    maxLength={MAX_MESSAGE_LENGTH}
                    placeholder="Message"
                    aria-label="Message"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault()
                            submit()
                        }
                    }}
                    style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
                    className="w-full resize-none bg-transparent text-[15px] leading-snug outline-none placeholder:text-muted-foreground"
                />
            </div>
            {/* **The slot itself opens; the field gives up the width to it.** An empty
                composer is the whole row, and the button costs nothing until there is
                something to send. The width is animated rather than switched because the
                field is `flex-1` and follows it frame by frame, so the box narrows into the
                button instead of jumping. The one keystroke that moves it is the first, when
                there is nothing written to re-wrap.

                `mb` centres the button on the field's *last line* rather than on the field:
                the row is bottom-aligned, so this holds as the box grows. It is the field's
                bottom padding plus half a line, less half the button. */}
            <motion.div
                initial={false}
                animate={{ width: showSend ? SEND_SLOT_WIDTH : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                onAnimationComplete={fit}
                className="mb-[7px] flex h-9 shrink-0 justify-end overflow-hidden"
            >
                <motion.button
                    type="button"
                    aria-label="Send"
                    onClick={submit}
                    tabIndex={showSend ? 0 : -1}
                    aria-hidden={!showSend}
                    animate={{ scale: showSend ? 1 : 0.4, opacity: showSend ? 1 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-secondary text-secondary-foreground"
                >
                    <Icon size="md">arrow_upward</Icon>
                </motion.button>
            </motion.div>
        </div>
    )
}

/* Block / Delete / Accept, in the composer's place while the thread is a request. */
const RequestGate = ({ other, onBlock, onRemove, onAccept, dismiss }) => (
    <div className="flex shrink-0 flex-col gap-4 border-t border-border/40 px-4 pt-4 pb-[max(1rem,calc(var(--bottom-inset)-var(--keyboard-inset)))]">
        <p className="text-sm leading-relaxed text-muted-foreground">
            Let <span className="font-medium text-foreground">{displayName(other)}</span> message
            you? They won&apos;t know you&apos;ve seen their message until you accept.
        </p>
        <div className="flex gap-2">
            <Button
                type="button"
                variant="secondary"
                className="flex-1 text-destructive"
                /* Dismissed only on success: a gate that closes on a failed block says
                   the opposite of what happened. */
                onClick={async () => {
                    if (await onBlock()) dismiss()
                }}
            >
                Block
            </Button>
            <Button
                type="button"
                variant="secondary"
                className="flex-1 text-destructive"
                onClick={async () => {
                    if (await onRemove()) dismiss()
                }}
            >
                Delete
            </Button>
            <Button type="button" className="flex-1" onClick={onAccept}>
                Accept
            </Button>
        </div>
    </div>
)

/* One open thread, without any opinion about what is around it: the header, the rail and
 * the composer in a column that fills whatever box it is given.
 *
 * Both presentations render exactly this — the phone's full-screen sheet and the desktop
 * two-pane's right half — so a conversation is one component and the surfaces differ only
 * in the frame. `onBack` is the difference that is real: a sheet is a place you came into
 * and has to offer a way out, while the desktop pane sits beside the list it was chosen
 * from and an arrow there would point at what is already on screen.
 *
 * **It is the thing that opens and polls the thread**, so exactly one may be mounted at a
 * time. That is why <ConversationView/> draws nothing on a desktop: the pane inside the
 * inbox already has it, and a second instance would double every request and fight over
 * the read cursor. */
export const ConversationPane = ({ conversationId, onBack, className }) => {
    const { openProfile } = useOpenProfile()
    const {
        conversation,
        items,
        hasOlder,
        waiting,
        sending,
        loadingOlder,
        send,
        accept,
        remove,
        block,
        loadOlder,
    } = useConversation(conversationId)

    const user = useUser()
    const other = conversation?.other ?? null
    const isRequest = Boolean(conversation?.isRequest)

    /* **Both ends float over the rail, so the rail has to know how tall they are.** Measured
     * rather than assumed, and for the same reason at each end: the header is a different
     * height in the two presentations and changes again when a name wraps, and the composer
     * grows line by line with the draft. */
    const headerRef = useRef(null)
    const composerRef = useRef(null)
    const headerHeight = useMeasuredHeight(headerRef)
    const composerHeight = useMeasuredHeight(composerRef)

    return (
        <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
            {/* **The header sits over the conversation rather than above it**, translucent
                and blurred, so the bubbles pass under it on their way out of view — the
                treatment iOS gives every scrolling surface. It is absolute for that reason;
                the rail pays for the space it covers with an equal top inset.
                `supports-backdrop-filter` keeps it legible where the blur is unavailable,
                by falling back to a more opaque plate instead of a see-through one.

                **The sheet stacks its contents and the pane lays them out in a row**, and
                `onBack` is what tells them apart — it is present exactly when this is the
                phone's full-screen sheet. A sheet has one job at the top and centres its
                subject over a back arrow; a pane sits beside a list in a wide column and
                reads left to right like every other header on a desktop. */}
            <div
                ref={headerRef}
                className={cn(
                    "absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-border/40 px-2 pb-2 pt-1",
                    "bg-background/70 backdrop-blur-md supports-backdrop-filter:bg-background/55",
                    !onBack && "px-6 pb-4 pt-9",
                )}
            >
                {onBack && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Back"
                        onClick={onBack}
                        className="rounded-full"
                    >
                        <Icon size="lg">arrow_back</Icon>
                    </Button>
                )}
                <button
                    type="button"
                    disabled={isRequest || !other?.handle}
                    onClick={() => other?.handle && openProfile(other.handle)}
                    className={cn(
                        "flex min-w-0 cursor-pointer items-center disabled:cursor-default pt-2",
                        onBack ? "flex-1 flex-col gap-1 pb-1" : "gap-3",
                    )}
                >
                    {other ? (
                        <span className={cn("relative", isRequest && "overflow-hidden rounded-full")}>
                            <Avatar
                                person={other}
                                className={cn(onBack ? "size-11" : "size-10", isRequest && "blur-[6px]")}
                            />
                        </span>
                    ) : (
                        <Skeleton className={cn("rounded-full", onBack ? "size-11" : "size-10")} />
                    )}
                    <span
                        className={cn(
                            "flex max-w-full items-center gap-0.5",
                            onBack ? "text-xs font-medium" : "text-base font-semibold",
                        )}
                    >
                        {other ? (
                            <>
                                <span className="truncate">{displayName(other)}</span>
                                {!isRequest && (
                                    <Icon size="xs" className="text-muted-foreground">chevron_right</Icon>
                                )}
                            </>
                        ) : (
                            /* Holds the line box the chevron gives this row when it is
                               drawn, so the header does not grow by the difference the
                               moment the name lands and shove the whole rail down. */
                            <span className={cn("flex items-center", onBack ? "h-5" : "h-6")}>
                                <Skeleton className={cn("rounded", onBack ? "h-3 w-24" : "h-4 w-32")} />
                            </span>
                        )}
                    </span>
                </button>
                {/* Balances the back arrow so the sheet's subject centres truly. */}
                {onBack && <span className="size-9 shrink-0" />}
            </div>

            {/* **Nothing stands in while a thread loads.** A skeleton is worth drawing
                where it tells the reader what is coming and roughly how much — a feed, a
                roster. A conversation resolves in a few hundred milliseconds from a local
                cache, and fake bubbles in the shape of a conversation that is not this one
                read as somebody else's words for a frame. Empty space and then a fade in
                says the same thing without inventing anything.

                **The two states cross-dissolve rather than taking turns.** `mode="wait"`
                would hold the outgoing one until it had gone and only then bring the next
                in, which puts a fully blank pane between two conversations — the flash.
                Overlapping them needs both on screen at once, which is why this box is
                `relative` and both children are `absolute inset-0`: in normal flow they
                would stack and the pane would double in height for the length of the
                fade. Only the *body* is duplicated, never the pane, so there is still one
                <useConversation/> and one poller.

                The key carries the conversation id, so switching threads fades even when
                both are ordinary rails; and `waiting` keeps the empty state out of the
                key until the thread has actually answered, so "no messages" is never
                asserted about a conversation that is still loading. */}
            <div className="relative min-h-0 flex-1">
                <AnimatePresence initial={false}>
                    {waiting ? (
                        <div key={`${conversationId}:waiting`} />
                    ) : items.length === 0 ? (
                        <Transition
                            fast
                            key={`${conversationId}:empty`}
                            className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-10 text-center"
                        >
                            <Icon size="xl" className="text-muted-foreground/70">
                                waving_hand
                            </Icon>
                            {/* **It says nothing about how any of this works.** The
                                protocol underneath is the strongest thing about the
                                feature and the last thing to advertise: telling people
                                their messages cannot be read invites using a parish app
                                for what a parish app should not carry. An empty thread is
                                also not the place for a disclosure nobody asked for — the
                                only thing missing here is a first message, so that is what
                                it says. */}
                            <p className="max-w-xs text-base text-muted-foreground">
                                Start a chat with{" "}
                                <span className="font-medium text-foreground">
                                    {other ? displayName(other) : "them"}
                                </span>
                            </p>
                        </Transition>
                    ) : (
                        <Transition
                            fast
                            key={`${conversationId}:rail`}
                            className="absolute inset-0 flex flex-col"
                        >
                            <Rail
                                items={items}
                                viewerId={user?.id}
                                hasOlder={hasOlder}
                                loadingOlder={loadingOlder}
                                onLoadOlder={loadOlder}
                                topInset={headerHeight}
                                bottomInset={isRequest ? 0 : composerHeight}
                            />
                        </Transition>
                    )}
                </AnimatePresence>
            </div>

            {isRequest ? (
                <RequestGate
                    other={other ?? {}}
                    onBlock={block}
                    onRemove={remove}
                    onAccept={accept}
                    dismiss={onBack ?? (() => {})}
                />
            ) : (
                <Composer ref={composerRef} onSend={send} sending={sending} />
            )}
        </div>
    )
}

