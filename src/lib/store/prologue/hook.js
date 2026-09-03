"use client"

import { useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { todayLocal } from "@/lib/utils"
import usePrologueStore from "./store"

/* Today's reading.
 *
 * The date is resolved inside the effect rather than during render, and that is the whole
 * reason this hook takes no argument. Client Components are still prerendered to HTML at
 * build time, so a clock read in the render path resolves to the build machine's date and
 * hydrates against the reader's — a mismatch that would show up as the wrong day. Nothing
 * rendered from this hook comes from the local clock: the heading is the `date` the server
 * echoed back, which is the date it actually served. */
export const usePrologue = () => {
    const [day, ready, error, load, refresh] = usePrologueStore(useShallow(state => ([
        state.day,
        state.ready,
        state.error.load,
        state.load,
        state.refresh,
    ])))

    useEffect(() => { load(todayLocal()) }, [load])

    return useMemo(() => ({
        day,
        /* Painted on the first frame and cleared once the reading lands, including on the
         * failure path — see the store. */
        skeleton: !ready,
        error,
        retry: refresh,
    }), [day, ready, error, refresh])
}
