"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn, withAlpha } from "@/lib/utils"

/* ── Geometry ───────────────────────────────────────────────────────────────
 * The mark is drawn to a canvas rather than imported from `assets/svg/` because
 * the gloss (specular blooms, inner rim light) and the colour swoop are painted
 * per-frame — so the outline lives here as raw path data, alongside the code
 * that paints it. */

const MARK_SIZE = { width: 308, height: 251 }
const { width: W, height: H } = MARK_SIZE

const MARK_PATHS = [
    "M304.4 0.356075C304.684 0.935026 303.791 1.39209 303.327 1.75293C302.791 2.16991 302.204 2.57084 301.759 2.90602C285.397 15.5355 269.217 28.1056 253.051 40.7575C248.991 43.9329 244.769 46.9159 240.75 50.1394C236.75 53.3469 232.662 56.4485 228.616 59.6015C216.484 69.0572 204.225 78.4134 192.044 87.9075C179.925 97.3552 167.503 106.508 155.309 116.052C151.288 119.197 147.257 122.426 143.09 125.514C138.957 128.577 134.963 131.807 130.706 134.729C128.555 136.207 126.7 137.98 124.681 139.503C118.56 144.114 111.431 147.811 103.463 150.696C92.7702 154.564 78.1915 156.14 65.4888 154.07C59.3555 153.068 53.7982 151.369 48.5642 149.296C43.4011 147.251 38.5131 144.698 34.3652 141.891C30.1562 139.041 26.0437 135.815 22.3946 132.18C11.7144 121.54 3.42028 107.468 0.765508 89.0606C-1.1958 75.4657 0.805731 61.6367 4.56263 51.2909C6.45154 46.0884 8.83762 41.1104 11.6613 36.7257C20.2483 23.397 31.3758 13.3961 46.4179 6.60906C51.3686 4.37505 57 2.47783 62.929 1.50596C66.0198 1.00238 69.1347 0.651164 72.5875 0.356075C75.918 0.0706093 79.765 0.280699 83.4849 0.109099C88.0769 -0.107406 92.7992 0.0561756 97.4361 0.109099C106.44 0.213342 115.575 0.19089 125.091 0.19089C139.09 0.19089 152.638 0.19089 166.368 0.19089C212.721 0.194097 257.924 0.0834392 304.4 0.356075Z",
    "M3.48821 250.838C2.98139 250.293 4.13179 249.767 4.56299 249.438C21.7611 236.266 39.2616 222.963 56.4887 209.777C58.7219 208.068 60.8457 206.201 63.0934 204.512C78.6858 192.786 94.3473 180.551 109.985 168.797C126.665 155.885 143.358 143.169 160.26 130.452C163.638 127.911 166.916 125.249 170.332 122.8C177.195 117.877 183.33 111.935 190.806 107.824C200.731 101.81 212.443 97.6727 227.543 96.9622C238.82 96.4298 248.482 98.6478 256.848 101.57C265.245 104.501 272.31 109.066 278.477 113.749C289.375 122.588 298.213 133.444 303.41 147.982C305.393 153.533 306.957 159.255 307.62 166.002C308.28 172.702 308.093 180.195 306.959 186.656C303.377 207.088 293.36 222.202 279.716 233.312C269.034 242.011 255.194 249.112 237.779 250.512C228.344 251.271 218.475 250.769 208.554 250.923C203.656 250.998 198.752 250.923 193.859 250.923C174.486 250.929 155.586 251.005 136.072 251.005C91.8229 251.003 47.4818 250.859 3.48821 250.838Z",
]

/* The mark reads as two rounded lobes joined by a diagonal band. Each lobe is lit
 * like a sphere, which is what gives the shape its blown-glass volume. Values are
 * fractions of the mark's width/height. */
const MARK_LOBES = [
    { x: 0.247, y: 0.303, r: 0.247 },
    { x: 0.753, y: 0.697, r: 0.247 },
]

/* ── Palettes ───────────────────────────────────────────────────────────────
 * Inspired by the reference capture, but retuned so a single set works on both
 * the light and dark app themes — no theme branch. `body` runs along the light
 * axis (top-left → bottom-right) beneath the white specular bloom, so each ramp
 * spans a wide luminance range: the pale lit side reads against a dark
 * background, the dark base reads against a light one. `accent` is a mid tone
 * from the same family that clears the pill's contrast on either background
 * (validated, not eyeballed) and reads with white button text. */
const MARK_PALETTES = [
    {
        key: "steel",
        body: [
            [0, "#dbe0e8"],
            [0.42, "#9aa3b2"],
            [0.74, "#69717f"],
            [1, "#3a414c"],
        ],
        rim: "#c2c9d4",
        glint: "#ffffff",
        bloom: { alpha: 0.82, scale: 1 },
        accent: "#5f6a79",
    },
    {
        key: "graphite",
        body: [
            [0, "#aeb4be"],
            [0.42, "#6f7681"],
            [0.74, "#454b54"],
            [1, "#232830"],
        ],
        rim: "#8b929d",
        glint: "#ffffff",
        /* Reads as dark chrome: a tighter, harder specular than the others. */
        bloom: { alpha: 0.92, scale: 0.72 },
        accent: "#5a616c",
    },
    {
        key: "iris",
        body: [
            [0, "#e2e4ff"],
            [0.4, "#b3a8f6"],
            [0.72, "#8b76ec"],
            [1, "#4c3bc0"],
        ],
        rim: "#cdc0ff",
        glint: "#ffffff",
        bloom: { alpha: 0.88, scale: 1.05 },
        accent: "#6d5be6",
    },
    {
        key: "jade",
        body: [
            [0, "#a7f0c6"],
            [0.4, "#37c47e"],
            [0.72, "#12a45c"],
            [1, "#067a42"],
        ],
        rim: "#6fe3a8",
        glint: "#ffffff",
        bloom: { alpha: 0.85, scale: 1 },
        accent: "#0f9f57",
    },
]

export const paletteFor = (key) =>
    MARK_PALETTES.find(p => p.key === key) ?? MARK_PALETTES[0]

/* Measured from the reference, where the wipe reads as quick (~0.15s). Nudged up
 * slightly so the swoop still registers at desktop sizes. */
const MARK_WIPE_MS = 220

/* The colour enters as a soft-edged disc expanding from just off the mark's right
 * edge, which is what produces the swoop across the shape. */
const MARK_WIPE_ORIGIN = { x: 1.12, y: 0.5 }
const MARK_WIPE_FEATHER = 0.28

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

/* Paints the mark as a single blown-glass body lit from the top-left: a base ramp
 * along the light axis, a specular bloom over each lobe, a bright rim on the
 * shaded edges, and a pair of hard glints. Coordinates are in the mark's own
 * viewBox units; `blur` converts those to the output pixels the shadow wants. */
const paintMark = (ctx, palette, blur) => {
    ctx.save()
    ctx.clip(MARK_PATH, "evenodd")

    const body = ctx.createLinearGradient(-0.05 * W, -0.08 * H, 1.02 * W, 1.06 * H)
    palette.body.forEach(([offset, color]) => body.addColorStop(offset, color))
    ctx.fillStyle = body
    ctx.fillRect(0, 0, W, H)

    const { alpha, scale } = palette.bloom
    MARK_LOBES.forEach((lobe, index) => {
        const r = lobe.r * W * scale
        /* The highlight sits up and slightly left of centre, where the key light
         * would strike a sphere. The trailing lobe catches less of it. */
        const x = lobe.x * W - 0.12 * r
        const y = lobe.y * H - 0.46 * r
        const strength = index === 0 ? alpha : alpha * 0.78

        const bloom = ctx.createRadialGradient(x, y, 0, x, y, r * 0.98)
        bloom.addColorStop(0, withAlpha(palette.glint, strength))
        bloom.addColorStop(0.42, withAlpha(palette.glint, strength * 0.38))
        bloom.addColorStop(1, withAlpha(palette.glint, 0))
        ctx.fillStyle = bloom
        ctx.fillRect(0, 0, W, H)
    })

    /* Offsetting a blurred stroke up-left leaves its ring inside the clip only
     * along the opposite edges — so the glow lands on the bottom-right, and the
     * dark counter-stroke on the top-left. */
    paintBlurred(ctx, blur, { color: withAlpha(palette.rim, 0.85), radius: 5, dx: -3.5, dy: -3.5 }, (c) => {
        c.lineWidth = 10
        c.strokeStyle = "#000"
        c.stroke(MARK_PATH)
    })

    paintBlurred(ctx, blur, { color: withAlpha("#000000", 0.22), radius: 7, dx: 4, dy: 4 }, (c) => {
        c.lineWidth = 12
        c.strokeStyle = "#000"
        c.stroke(MARK_PATH)
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

const GlossyMark = memo(({ from, to, onClick, className, ...props }) => {
    const canvasRef = useRef(null)
    const offscreenRef = useRef(null)
    const progressRef = useRef(1)
    const frameRef = useRef(0)
    const paintedRef = useRef(false)
    const renderRef = useRef(null)
    const reduceMotion = useReducedMotion()

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

    /* Measured off the reference: the mark flies up and to the right from below
     * while scaling in, overshooting ~6% before it settles. */
    const entrance = reduceMotion ? {} : {
        initial: { opacity: 0, scale: 0.06, x: "-47%", y: "80%" },
        animate: { opacity: 1, scale: 1, x: "0%", y: "0%" },
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
            className={cn("block aspect-[308/251] w-full select-none", onClick && "cursor-pointer touch-manipulation", className)}
            {...entrance}
            {...props}
        />
    )
})

GlossyMark.displayName = "GlossyMark"

export default GlossyMark
