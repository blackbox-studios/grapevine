"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { animate, motion, useMotionValue, useTransform } from "motion/react"

import Img from "@/components/Img"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { cn } from "@/lib/utils"

/* Springs the photo back into place on release — same feel as the carousel's snap. */
const SPRING = { type: "spring", stiffness: 500, damping: 42 }

const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
const midpoint = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 })

/* Instagram-style peek zoom for a photo on touch: pinch with two fingers and the image lifts
 * above the UI, scaling about the point between your fingers and tracking them as they move;
 * lifting a finger springs it back into place. It never latches — this is the momentary "look
 * closer" gesture, not a zoom mode.
 *
 * Rolled by hand because the app disables the browser's own pinch-zoom (viewport
 * user-scalable=false, see layout.jsx) so composers don't auto-zoom on focus — which also means
 * the native gesture would either zoom the whole page or, in the Capacitor webview, do nothing.
 * The live gesture is a clone of the image portaled to <body> so it can escape an ancestor's
 * `overflow-hidden` and paint over the caption/rail; the original stays put underneath so
 * there's no flicker on the first frame.
 *
 * `resolve(midpoint)` runs when a two-finger gesture begins and returns the `{ src, rect }` of
 * the image to lift (screen rect from getBoundingClientRect), or null to ignore the gesture —
 * that's the seam the carousel uses to zoom whichever slide is currently showing. Touch
 * listeners are attached natively (not via React props) so `touchmove` is non-passive and can
 * `preventDefault()`, the only reliable way to stop the page from also panning.
 *
 * `onPinch(active)` fires on start/end so a host gesture (the carousel's swipe) can stand down
 * while a pinch owns the fingers. */
export const usePinchZoom = (targetRef, resolve, onPinch) => {
    const mounted = useMounted()
    const active = useRef(null) // { startDist, startMid } while a pinch is live
    const [overlay, setOverlay] = useState(null) // { src, rect, ox, oy }

    const scale = useMotionValue(1)
    const x = useMotionValue(0)
    const y = useMotionValue(0)
    const backdrop = useTransform(scale, [1, 2.5], [0, 0.85])

    /* Keep the latest resolve/onPinch reachable from the stable listeners below without
     * re-subscribing every render (resolve closes over the carousel's live index). */
    const resolveRef = useRef(resolve)
    const onPinchRef = useRef(onPinch)
    resolveRef.current = resolve
    onPinchRef.current = onPinch

    useEffect(() => {
        const el = targetRef.current
        if (!el) return

        const onStart = (e) => {
            if (e.touches.length !== 2) return
            const m = midpoint(e.touches[0], e.touches[1])
            const target = resolveRef.current?.(m)
            if (!target) return
            active.current = {
                startDist: distance(e.touches[0], e.touches[1]) || 1,
                startMid: m,
            }
            scale.set(1)
            x.set(0)
            y.set(0)
            /* Anchor the scale to the pinch point (as a fraction of the image box) so the
             * content between the fingers stays put while everything grows around it. */
            setOverlay({
                src: target.src,
                rect: target.rect,
                ox: (m.x - target.rect.left) / target.rect.width,
                oy: (m.y - target.rect.top) / target.rect.height,
            })
            onPinchRef.current?.(true)
        }

        const onMove = (e) => {
            const g = active.current
            if (!g || e.touches.length !== 2) return
            e.preventDefault()
            const m = midpoint(e.touches[0], e.touches[1])
            scale.set(Math.max(1, distance(e.touches[0], e.touches[1]) / g.startDist))
            x.set(m.x - g.startMid.x)
            y.set(m.y - g.startMid.y)
        }

        const onEnd = (e) => {
            if (!active.current || e.touches.length >= 2) return
            active.current = null
            onPinchRef.current?.(false)
            animate(scale, 1, SPRING)
            animate(x, 0, SPRING)
            animate(y, 0, { ...SPRING, onComplete: () => setOverlay(null) })
        }

        el.addEventListener("touchstart", onStart, { passive: false })
        el.addEventListener("touchmove", onMove, { passive: false })
        el.addEventListener("touchend", onEnd, { passive: false })
        el.addEventListener("touchcancel", onEnd, { passive: false })
        return () => {
            el.removeEventListener("touchstart", onStart)
            el.removeEventListener("touchmove", onMove)
            el.removeEventListener("touchend", onEnd)
            el.removeEventListener("touchcancel", onEnd)
        }
    }, [targetRef, scale, x, y])

    return mounted && overlay
        ? createPortal(
              <div className="fixed inset-0 z-[60]">
                  <motion.div
                      className="absolute inset-0 bg-black"
                      style={{ opacity: backdrop }}
                  />
                  <motion.img
                      src={overlay.src}
                      alt=""
                      draggable={false}
                      className="pointer-events-none absolute select-none object-contain"
                      style={{
                          left: overlay.rect.left,
                          top: overlay.rect.top,
                          width: overlay.rect.width,
                          height: overlay.rect.height,
                          transformOrigin: `${overlay.ox * 100}% ${overlay.oy * 100}%`,
                          scale,
                          x,
                          y,
                      }}
                  />
              </div>,
              document.body,
          )
        : null
}

/* A single, self-contained zoomable photo: renders the base image and lifts a clone of it on
 * pinch. (Carousels drive the hook directly against whichever slide is showing.) */
const PinchZoom = ({ src, alt = "", className, imgClassName }) => {
    const wrapRef = useRef(null)
    const overlay = usePinchZoom(wrapRef, () => ({
        src,
        rect: wrapRef.current.getBoundingClientRect(),
    }))

    return (
        <div ref={wrapRef} className={className} style={{ touchAction: "pan-y" }}>
            <Img
                src={src}
                alt={alt}
                draggable={false}
                className={cn("pointer-events-none select-none", imgClassName)}
            />
            {overlay}
        </div>
    )
}

export default PinchZoom
