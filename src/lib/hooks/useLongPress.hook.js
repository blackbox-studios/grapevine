"use client"

import { useCallback, useEffect, useRef } from "react"

import { haptic } from "@/lib/native"

/* Press-and-hold, for an affordance a phone has nowhere else to put.
 *
 * A touch screen has no hover, so a control that appears on hover on a desktop needs a
 * second way in on a phone — holding the thing itself. Returns props to spread onto the
 * element; it renders nothing and takes no opinion on what opens.
 *
 * **Pointer events, and mouse pointers are ignored.** A mouse has hover, so a desktop
 * surface should be offering the affordance directly rather than making someone hold the
 * button down to find it; letting a held click fire this too would give the same action two
 * entrances on the one platform that only needs one. */

const LONG_PRESS_MS = 450

/* How far a finger may drift and still count as a hold. Generous enough to survive the
 * wobble of a resting thumb, tight enough that a scroll is never mistaken for a press —
 * which matters here because the element is usually inside a scrolling thread. */
const MOVE_TOLERANCE_PX = 10

export const useLongPress = (onLongPress, { delay = LONG_PRESS_MS, enabled = true } = {}) => {
    const timer = useRef(null)
    const origin = useRef(null)
    const callback = useRef(onLongPress)
    callback.current = onLongPress

    const cancel = useCallback(() => {
        if (timer.current !== null) clearTimeout(timer.current)
        timer.current = null
        origin.current = null
    }, [])

    /* A press that outlives the element — the row is deleted, the surface closes — must not
     * fire into a component that is gone. */
    useEffect(() => cancel, [cancel])

    const onPointerDown = useCallback(
        (event) => {
            if (!enabled || event.pointerType === "mouse") return
            origin.current = { x: event.clientX, y: event.clientY }
            timer.current = setTimeout(() => {
                timer.current = null
                /* The hold has been recognized and nothing else will confirm it — there is
                 * no click to follow — so the tap back is the only signal that it took. */
                haptic()
                callback.current?.()
            }, delay)
        },
        [delay, enabled],
    )

    const onPointerMove = useCallback(
        (event) => {
            if (timer.current === null || !origin.current) return
            const drift = Math.hypot(
                event.clientX - origin.current.x,
                event.clientY - origin.current.y,
            )
            if (drift > MOVE_TOLERANCE_PX) cancel()
        },
        [cancel],
    )

    return {
        onPointerDown,
        onPointerMove,
        onPointerUp: cancel,
        onPointerCancel: cancel,
        onPointerLeave: cancel,
        /* A hold on text is the WebView's own gesture for "select this" and Android's for a
         * context menu. Both would land on top of whatever the hold opens, so the element
         * that carries these handlers declines them. */
        onContextMenu: (event) => {
            if (enabled) event.preventDefault()
        },
    }
}

export default useLongPress
