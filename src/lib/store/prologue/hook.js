"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { addDays } from "@/lib/utils"
import { useReadingTranslation } from "@/lib/store/prefs/hook"
import usePrologueStore, { DAY_REACH } from "./store"

/* The reading, and the few days the stepper may reach.
 *
 * The hook takes no date, and that is deliberate: `init` resolves today from the clock inside
 * a callback rather than during render. Client Components are still prerendered to HTML at
 * build time, so a clock read in the render path resolves to the build machine's date and
 * hydrates against the reader's — which would show up as the wrong day. Nothing rendered from
 * here comes from the local clock either; the heading is the `date` the server echoed back,
 * which is the date it actually served.
 *
 * Mounting resets to today. Somebody who stepped to tomorrow, left, and came back is opening
 * the *Daily* Read again, so today is where it should start.
 *
 * The translation is read here and handed down, which is the `useCurrentOrg` arrangement a
 * second time: the store holds what it has fetched, the preference lives in `prefs`, and this
 * hook is the one place the two meet. Changing it re-runs the effect, so the days printed in
 * the old English are dropped on the way in rather than by anything having to invalidate
 * them. */
export const usePrologue = () => {
    const { translation } = useReadingTranslation()
    const [days, date, today, ready, error, init, show, refresh] = usePrologueStore(
        useShallow(state => ([
            state.days,
            state.date,
            state.today,
            state.ready,
            state.error.load,
            state.init,
            state.show,
            state.refresh,
        ])),
    )

    useEffect(() => { init(translation) }, [init, translation])

    /* Every date the stepper can offer, oldest first, so the dots are drawn straight from it
     * and `index` is both the active dot and the position the arrows move from. */
    const dates = useMemo(() => {
        if (!today) return []
        const span = []
        for (let offset = -DAY_REACH; offset <= DAY_REACH; offset += 1) {
            span.push(addDays(today, offset))
        }
        return span
    }, [today])

    const index = dates.indexOf(date)

    const select = useCallback((next) => { show(next) }, [show])

    return useMemo(() => ({
        day: days[date] ?? null,
        /* The date on screen, which is what the page cross-fades on: it changes exactly when
         * the reading does, where a key built from the content would also re-fade a retry. */
        date,
        /* Painted on the first frame and cleared once the reading lands, including on the
         * failure path — see the store. A cached day never raises it at all. */
        skeleton: !ready,
        error,
        retry: refresh,
        dates,
        index,
        select,
    }), [days, date, ready, error, refresh, dates, index, select])
}
