"use client"

import { useSyncExternalStore } from "react"

/* Reactive breakpoint read. Subscribes to the media query so the value flips live
 * as the viewport crosses the breakpoint — a resized window, a rotated device, or a
 * shared link opened on a desktop. Surfaces that adapt their layout on the fly (the
 * post view's dialog ↔ full-screen swap) read this. Server snapshot is `false`
 * (mobile-first), matching the app's other viewport reads. Breakpoint is Tailwind
 * `sm` (640px). */
const QUERY = "(min-width: 640px)"

const subscribe = (callback) => {
    const mql = window.matchMedia(QUERY)
    mql.addEventListener("change", callback)
    return () => mql.removeEventListener("change", callback)
}

export const useIsDesktop = () =>
    useSyncExternalStore(
        subscribe,
        () => window.matchMedia(QUERY).matches,
        () => false,
    )

export default useIsDesktop
