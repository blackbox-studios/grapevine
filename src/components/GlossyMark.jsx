"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { useMounted } from "@/lib/hooks/useMounted.hook"
import { MARK_LOBES, MARK_PALETTES, MARK_PATHS, MARK_SIZE, bodyRampFor, paletteFor } from "@/lib/mark"
import { cn, withAlpha } from "@/lib/utils"

/* ── Geometry and palettes ──────────────────────────────────────────────────
 * Both live in `lib/mark.js`, shared with `scripts/generate-icons.mjs` so the app icon
 * and the on-screen mark cannot drift apart. Only the canvas painting lives here. */
const { width: W, height: H } = MARK_SIZE

/* Re-exported so callers keep importing the palette helper from the component they
 * already use, rather than reaching into lib/mark.js for one function. */
export { paletteFor }

/* Measured from the reference, where the wipe reads as quick (~0.15s). Nudged up
 * slightly so the swoop still registers at desktop sizes. */
const MARK_WIPE_MS = 220

/* The colour enters as a soft-edged disc expanding from just off the mark's right
 * edge, which is what produces the swoop across the shape. */
const MARK_WIPE_ORIGIN = { x: 1.12, y: 0.5 }
const MARK_WIPE_FEATHER = 0.28

/* Measured off the reference: the mark flies up and to the right from below
 * while scaling in, overshooting ~6% before it settles. */
const MARK_ENTER_FROM = { opacity: 0, scale: 0.06, x: "-47%", y: "80%" }
const MARK_ENTER_TO = { opacity: 1, scale: 1, x: "0%", y: "0%" }

/* ── Cycle hook ─────────────────────────────────────────────────────────────
 * Steps the mark through its palettes — steel → graphite → iris → jade — one
 * colour per `advance()` call, so the swoop is something the screen does in
 * response to a press rather than on a timer. Only the discrete step lives in
 * React state; <GlossyMark/> owns the wipe itself and animates `from` → `to` on
 * its own canvas clock, so the swoop never touches the React tree. */
export function useMarkCycle() {
    const [step, setStep] = useState(0)

    const advance = useCallback(() => setStep(s => s + 1), [])

    return useMemo(() => {
        const to = MARK_PALETTES[step % MARK_PALETTES.length]
        const from = MARK_PALETTES[(step + MARK_PALETTES.length - 1) % MARK_PALETTES.length]
        return { from: from.key, to: to.key, advance }
    }, [step, advance])
}

/* Path2D has no serialisable form, so the outline is built once per module load
 * and shared by every instance. */
const MARK_COUNTERS = typeof Path2D === "undefined" ? [] : MARK_PATHS.map(d => new Path2D(d))
const MARK_PATH = typeof Path2D === "undefined" ? null : MARK_PATHS.reduce((path, d) => {
    path.addPath(new Path2D(d))
    return path
}, new Path2D())

/* The soft passes (rim light, counter-edge, glints) are blurred with the canvas
 * *shadow*, not `ctx.filter`. WKWebView and the Android WebView expose `ctx.filter`
 * as a string — so a naive feature-detect passes — but silently paint nothing
 * through a `blur()` filter, which is why the gloss "landed hard" and read as
 * cartoonish on device. `shadowBlur` is honoured everywhere. The trick: draw the
 * real geometry far outside the clip and offset only its blurred shadow back into
 * place, so nothing but the soft shadow shows. shadowBlur/shadowOffset live in
 * output pixels (the CTM doesn't touch them), so both go through `blur()`; the
 * escape translate is in the mark's own viewBox units. The drawn shape is painted
 * opaque — its coverage is all the shadow needs; the tint and alpha come from
 * `color`. */
const BLUR_ESCAPE = 1000

const paintBlurred = (ctx, blur, { color, radius, dx = 0, dy = 0 }, draw) => {
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = blur(radius)
    ctx.shadowOffsetX = blur(BLUR_ESCAPE + dx)
    ctx.shadowOffsetY = blur(BLUR_ESCAPE + dy)
    ctx.translate(-BLUR_ESCAPE, -BLUR_ESCAPE)
    draw(ctx)
    ctx.restore()
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3)

/* Paints the mark as two blown-glass counters, each lit from the top-left the
 * same way: a base ramp along the light axis, a specular bloom, a bright rim on
 * the shaded edges, and a hard glint. Coordinates are in the mark's own viewBox
 * units; `blur` converts those to the output pixels the shadow wants. */
const paintMark = (ctx, palette, blur) => {
    ctx.save()

    /* The body is *filled* through the path, not painted into a clip of it.
     *
     * `ctx.clip()` is the obvious way to write this and it is what put stair-steps on
     * every curve: a canvas clip region is hard-edged, quantising coverage to one bit per
     * pixel, so the gradient underneath got a jagged boundary no amount of resolution
     * hid. `fill()` antialiases the same outline properly.
     *
     * Everything after this then paints with `source-atop`, which confines it to the
     * alpha already on the canvas — the soft edge the fill just laid down. Same
     * containment the clip gave, but it inherits the antialiasing instead of discarding
     * it. This is also why the wipe's offscreen pass composites cleanly: it starts from
     * the same soft alpha rather than a binary mask. */
    MARK_LOBES.forEach((lobe, i) => {
        const ramp = bodyRampFor(lobe)
        const body = ctx.createLinearGradient(ramp.x1, ramp.y1, ramp.x2, ramp.y2)
        palette.body.forEach(([offset, color]) => body.addColorStop(offset, color))
        ctx.fillStyle = body
        ctx.fill(MARK_COUNTERS[i], "evenodd")
    })
    ctx.globalCompositeOperation = "source-atop"

    const { alpha, scale } = palette.bloom
    MARK_LOBES.forEach((lobe) => {
        const r = lobe.r * W * scale
        /* The highlight sits up and slightly left of centre, where the key light
         * would strike a sphere. */
        const x = lobe.x * W - 0.12 * r
        const y = lobe.y * H - 0.46 * r

        const bloom = ctx.createRadialGradient(x, y, 0, x, y, r * 0.98)
        bloom.addColorStop(0, withAlpha(palette.glint, alpha))
        bloom.addColorStop(0.42, withAlpha(palette.glint, alpha * 0.38))
        bloom.addColorStop(1, withAlpha(palette.glint, 0))
        ctx.fillStyle = bloom
        ctx.fillRect(0, 0, W, H)
    })

    /* Offsetting a blurred stroke up-left leaves its ring inside each counter only
     * along the opposite edges — so the glow lands on the bottom-right of both g's,
     * and the dark counter-stroke on the top-left. */
    paintBlurred(ctx, blur, { color: withAlpha(palette.rim, 0.85), radius: 5, dx: -3.5, dy: -3.5 }, (c) => {
        c.lineWidth = 10
        c.strokeStyle = "#000"
        MARK_COUNTERS.forEach((path) => c.stroke(path))
    })

    paintBlurred(ctx, blur, { color: withAlpha("#000000", 0.22), radius: 7, dx: 4, dy: 4 }, (c) => {
        c.lineWidth = 12
        c.strokeStyle = "#000"
        MARK_COUNTERS.forEach((path) => c.stroke(path))
    })

    MARK_LOBES.forEach((lobe) => {
        const r = lobe.r * W
        paintBlurred(ctx, blur, { color: withAlpha(palette.glint, 0.9), radius: 1.6 }, (c) => {
            c.fillStyle = "#000"
            c.translate(lobe.x * W - 0.58 * r, lobe.y * H - 0.58 * r)
            c.rotate(-Math.PI / 4)
            c.beginPath()
            c.ellipse(0, 0, 0.19 * r, 0.075 * r, 0, 0, Math.PI * 2)
            c.fill()
        })
    })

    ctx.restore()
}

/* The incoming colour arrives as a soft-edged disc expanding from just off the
 * mark's right edge — the swoop. Painted offscreen, punched down to the disc with
 * `destination-in`, then laid over the outgoing palette. */
const paintWipe = (ctx, offscreen, palette, progress, blur, pixel) => {
    const scratch = offscreen.getContext("2d")
    scratch.setTransform(1, 0, 0, 1, 0, 0)
    scratch.clearRect(0, 0, offscreen.width, offscreen.height)
    scratch.setTransform(pixel, 0, 0, pixel, 0, 0)
    paintMark(scratch, palette, blur)

    const originX = MARK_WIPE_ORIGIN.x * W
    const originY = MARK_WIPE_ORIGIN.y * H
    const feather = MARK_WIPE_FEATHER * W
    const reach = Math.hypot(originX, Math.max(originY, H - originY)) + feather
    const outer = Math.max(easeOut(progress) * reach, 0.001)
    const inner = Math.max(outer - feather, 0)

    const mask = scratch.createRadialGradient(originX, originY, inner, originX, originY, outer)
    mask.addColorStop(0, withAlpha("#000000", 1))
    mask.addColorStop(1, withAlpha("#000000", 0))
    scratch.globalCompositeOperation = "destination-in"
    scratch.fillStyle = mask
    scratch.fillRect(0, 0, W, H)
    scratch.globalCompositeOperation = "source-over"

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(offscreen, 0, 0)
    ctx.restore()
}

/* `style` is pulled out of the rest props deliberately: the aspect ratio below is set
 * inline, and a trailing `{...props}` would otherwise replace the whole style object and
 * take it with it. */
const GlossyMark = memo(({ from, to, onClick, className, style, ...props }) => {
    const canvasRef = useRef(null)
    const offscreenRef = useRef(null)
    const progressRef = useRef(1)
    const frameRef = useRef(0)
    const paintedRef = useRef(false)
    const renderRef = useRef(null)
    const reduceMotion = useReducedMotion()
    /* Armed after mount because Motion skips `initial` under an ancestor
     * AnimatePresence with `initial={false}`, and this mark sits in one. */
    const mounted = useMounted()

    /* Draws the outgoing palette, then the incoming one under its expanding mask.
     * Reads progress from a ref so the wipe never re-renders the React tree. */
    const render = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas || !MARK_PATH) return

        /* clientWidth, not getBoundingClientRect: the latter reports the tapped
         * (scaled) size, which would make the wipe loop resize the backing store
         * every frame during the press and jitter the layout. clientWidth is the
         * untransformed layout width. */
        const cssWidth = canvas.clientWidth
        if (cssWidth === 0) return

        const dpr = window.devicePixelRatio || 1
        const pixel = (cssWidth / W) * dpr
        const target = { width: Math.round(W * pixel), height: Math.round(H * pixel) }

        if (canvas.width !== target.width || canvas.height !== target.height) {
            canvas.width = target.width
            canvas.height = target.height
        }

        const ctx = canvas.getContext("2d")
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.setTransform(pixel, 0, 0, pixel, 0, 0)

        const blur = (units) => units * pixel
        const progress = progressRef.current

        paintMark(ctx, paletteFor(progress >= 1 ? to : from), blur)

        if (progress < 1) {
            let offscreen = offscreenRef.current
            if (!offscreen) {
                offscreen = document.createElement("canvas")
                offscreenRef.current = offscreen
            }
            if (offscreen.width !== target.width || offscreen.height !== target.height) {
                offscreen.width = target.width
                offscreen.height = target.height
            }
            paintWipe(ctx, offscreen, paletteFor(to), progress, blur, pixel)
        }
    }, [from, to])

    renderRef.current = render

    /* A new `to` starts a wipe; the loop runs only while one is in flight. Keyed on
     * `to` alone — a resize or theme flip repaints (below) without restarting it. */
    useEffect(() => {
        cancelAnimationFrame(frameRef.current)

        /* The first palette has nothing to arrive over — it rides in on the
         * entrance animation instead. */
        if (reduceMotion || !paintedRef.current) {
            paintedRef.current = true
            progressRef.current = 1
            renderRef.current()
            return
        }

        progressRef.current = 0
        const start = performance.now()

        const step = (now) => {
            progressRef.current = Math.min((now - start) / MARK_WIPE_MS, 1)
            renderRef.current()
            if (progressRef.current < 1) frameRef.current = requestAnimationFrame(step)
        }
        frameRef.current = requestAnimationFrame(step)

        return () => cancelAnimationFrame(frameRef.current)
    }, [to, reduceMotion])

    /* Repaint on resize and on theme flips, holding whatever progress we're at. */
    useEffect(() => {
        render()
        const canvas = canvasRef.current
        if (!canvas) return

        const observer = new ResizeObserver(() => render())
        observer.observe(canvas)
        return () => observer.disconnect()
    }, [render])

    const entrance = reduceMotion ? {} : {
        initial: MARK_ENTER_FROM,
        animate: mounted ? MARK_ENTER_TO : MARK_ENTER_FROM,
        transition: {
            default: { type: "spring", stiffness: 123, damping: 15, mass: 1 },
            opacity: { duration: 0.3, ease: "easeOut" },
            ...(onClick ? { tap: { type: "spring", stiffness: 700, damping: 32, mass: 0.6 } } : {}),
        },
    }

    return (
        <motion.canvas
            ref={canvasRef}
            width={W}
            height={H}
            role={onClick ? "button" : undefined}
            aria-label={onClick ? "Change logo color" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onClick(event)
                }
            } : undefined}
            whileTap={onClick ? { scale: 0.96 } : undefined}
            /* Derived from MARK_SIZE, never written as a literal. This was hardcoded to the
             * old mark's 308/251 and stayed behind when the outline changed, which left the
             * element 13% taller than the bitmap `render()` sizes from the same constants —
             * so the browser stretched the canvas vertically to fit, and the stair-steps
             * that produced read as the mark being badly antialiased. Any mismatch between
             * this ratio and MARK_SIZE resamples the mark; keep them the same source. */
            style={{ aspectRatio: `${W} / ${H}`, ...style }}
            className={cn("block w-full select-none", onClick && "cursor-pointer touch-manipulation", className)}
            {...entrance}
            {...props}
        />
    )
})

GlossyMark.displayName = "GlossyMark"

export default GlossyMark
