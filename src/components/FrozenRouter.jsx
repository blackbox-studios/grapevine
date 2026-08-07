"use client"

import { useContext, useEffect, useRef } from "react"
import { useIsPresent } from "motion/react"
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"

/* Freezes the App Router's LayoutRouterContext for a subtree that AnimatePresence
 * is animating *out*, so the exiting page keeps rendering its old route instead of
 * flashing the new one mid-fade. The naive version freezes on mount forever — that
 * breaks nested transitions where the parent key is intentionally held stable
 * (e.g. Settings sub-tabs collapse to a single "/settings" key), because the frozen
 * context would stop the child segment from ever updating.
 *
 * Instead we key off framer-motion's presence: while the subtree is present we pass
 * the live context straight through (so nested navigation keeps working), and only
 * once it starts exiting do we pin it to the last value it saw while present. */
export default function FrozenRouter({ children }) {
    const context = useContext(LayoutRouterContext)
    const isPresent = useIsPresent()
    const frozen = useRef(context)

    /* Track the live router context while on screen; once exiting we stop updating
     * so `frozen.current` holds the last value the subtree saw while present. */
    useEffect(() => {
        if (isPresent) frozen.current = context
    })

    return (
        <LayoutRouterContext.Provider value={isPresent ? context : frozen.current}>
            {children}
        </LayoutRouterContext.Provider>
    )
}
