"use client"

import { useSyncExternalStore } from "react"

/* Whether the primary pointer can hover — the question a hover-revealed surface is really
 * asking, and not the same one as the viewport width: an iPad in landscape is desktop-wide and
 * has no hover at all, so sizing that decision off the breakpoint leaves a tablet with a
 * surface only a mouse can open. Server snapshot is `false`, so the first paint offers the
 * gesture every pointer has. */
const QUERY = "(hover: hover) and (pointer: fine)"

const subscribe = (callback) => {
    const mql = window.matchMedia(QUERY)
    mql.addEventListener("change", callback)
    return () => mql.removeEventListener("change", callback)
}

export const useHasHover = () =>
    useSyncExternalStore(
        subscribe,
        () => window.matchMedia(QUERY).matches,
        () => false,
    )

export default useHasHover
