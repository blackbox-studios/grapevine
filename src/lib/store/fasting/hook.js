"use client"

import { useEffect } from "react"
import { useShallow } from "zustand/react/shallow"

import { whenIdle } from "@/lib/utils"
import useFastingStore from "./store"

/* The rule for one date, for a surface that is about that date.
 *
 * `enabled` is the sheet's `showFasting`: a rota for the car park asks for nothing, and passing
 * the flag in rather than making the caller branch is what keeps the request out of the render
 * path of every other sign-up. A date already warmed resolves synchronously and the skeleton is
 * never drawn, which is the ordinary case — see `useFastingWarm`. */
export const useFasting = (date, enabled = true) => {
    const [fasting, blank, fetch] = useFastingStore(
        useShallow(state => ([
            state.days[date] ?? null,
            Boolean(state.blank[date]),
            state.fetch,
        ])),
    )

    useEffect(() => {
        if (enabled && date) fetch(date)
    }, [enabled, date, fetch])

    return {
        fasting: enabled ? fasting : null,
        /* Reads as "no answer yet", and is therefore truthy on the very first render. The fetch
         * below runs in an effect, so a flag raised when the request starts is still false at
         * the first paint — deriving the skeleton from one gives nothing, then a skeleton, then
         * the strip, which is two shifts on a form this sits at the top of. A date the almanac
         * had nothing for is `blank` rather than absent, which is what settles this to no strip
         * instead of a skeleton that never resolves. */
        skeleton: enabled && !fasting && !blank,
    }
}

/* Reads the dates a surface is showing before anybody taps one.
 *
 * The rota is a list of dates and the sign-up surface opens over one of them, so every date that
 * could be tapped is on screen already. Warming them in an idle moment is what turns opening one
 * into a component that renders rather than a request that has to come back.
 *
 * Idle, so a date nobody has asked for never competes with the screen they are on. The dates are
 * depended on as a string: the caller derives them from a list on every render, and an array
 * would restart the effect each time.
 *
 * Bounded by whoever calls it, not here — see `<RotaPage/>` for why it is the next few dates
 * rather than all of them. */
export const useFastingWarm = (dates) => {
    const warm = useFastingStore(state => state.warm)
    const key = (dates ?? []).join(",")

    useEffect(() => {
        if (!key) return
        return whenIdle(() => warm(key.split(",")))
    }, [key, warm])
}
