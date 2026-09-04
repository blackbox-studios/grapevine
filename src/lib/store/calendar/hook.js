"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { CALENDAR_ENTRY } from "@/lib/constants"
import { useCurrentOrg } from "@/lib/store/org/hook"
import { dayKey, monthGrid } from "@/lib/utils"
import useCalendarStore from "./store"

/* The compiled calendar, as the month grid and the day panel read it.
 *
 * **The bucketing happens here, once, and not in the grid.** Forty-two squares each filtering
 * a list of entries is forty-two passes over the same array on every render, and every one of
 * them would have to agree about what "the same day" means. One `Map` keyed by `YYYY-MM-DD` is
 * built when the entries change and read by key thereafter, which also makes the day panel's
 * lookup free.
 *
 * The keys are the **reader's own local days**, which is where the wire's instants become
 * clock readings. See the note on `dayKey`. */
export const useCalendar = () => {
    const [
        month, monthKey, months, hasCalendar, ready, selected, view,
        load, openDay, closeDay, stepDay, step, today,
    ] = useCalendarStore(useShallow(state => ([
        state.month,
        state.monthKey,
        state.months,
        state.hasCalendar,
        state.ready,
        state.selected,
        state.view,
        state.load,
        state.openDay,
        state.closeDay,
        state.stepDay,
        state.step,
        state.today,
    ])))

    /* The month on screen, out of the cache. Empty while it is still being fetched, which is
     * what the skeleton covers. */
    const items = useMemo(() => months[monthKey] ?? [], [months, monthKey])

    const { orgId, skeleton: resolvingOrg } = useCurrentOrg()

    /* Re-runs on a group switch and on a month step, and on nothing else.
     *
     * **Keyed on `monthKey`, a string, and never on `month`, a Date.** The month's actions set
     * both, so the string moves exactly when the month does — where depending on the Date means
     * depending on an identity, and any write that touches it turns this effect into an update
     * loop. `load` takes no month for the same reason; see it. */
    useEffect(() => {
        if (orgId) load(orgId)
    }, [orgId, monthKey, load])

    /* Every entry, filed under the local day it starts on. */
    const byDay = useMemo(() => {
        const map = new Map()
        for (const entry of items) {
            const key = dayKey(entry.startsAt)
            const list = map.get(key)
            if (list) list.push(entry)
            else map.set(key, [entry])
        }
        return map
    }, [items])

    /* The six weeks the grid draws, each square carrying what it needs to draw itself: the
     * date, whether it belongs to the month on screen, and which of the two rings it wears.
     *
     * The rings are booleans rather than a count, because that is the whole of what the ring
     * says — "something of this kind is on this day". A number would be a badge, and a month
     * of badges is the cluttered grid this design is avoiding. */
    const days = useMemo(() => {
        if (!month) return []
        const todayKey = dayKey(new Date())
        const monthIndex = month.getMonth()

        return monthGrid(month).map(date => {
            const key = dayKey(date)
            const entries = byDay.get(key) ?? []
            return {
                key,
                date,
                day: date.getDate(),
                inMonth: date.getMonth() === monthIndex,
                /* The only square the grid marks. There is no selection to show: tapping one
                 * navigates, so nothing on this surface is ever "chosen and still here". */
                isToday: key === todayKey,
                parish: entries.some(entry => entry.kind === CALENDAR_ENTRY.PARISH),
                signup: entries.some(entry => entry.kind === CALENDAR_ENTRY.SIGNUP),
                /* Whether the viewer is standing for something that day, which is what fills
                 * the sign-up ring in rather than leaving it hollow. */
                mine: entries.some(entry => entry.mine),
                count: entries.length,
            }
        })
    }, [month, byDay])

    const entries = useMemo(
        () => (selected ? (byDay.get(selected) ?? []) : []),
        [selected, byDay],
    )

    const next = useCallback(() => step(1), [step])
    const previous = useCallback(() => step(-1), [step])
    const nextDay = useCallback(() => stepDay(1), [stepDay])
    const previousDay = useCallback(() => stepDay(-1), [stepDay])

    /* Whether the reader has paged away from the current month, which is the only time "Today"
     * means anything — on the current month it is a button that does nothing. */
    const away = monthKey !== dayKey(new Date()).slice(0, 7)

    return useMemo(() => ({
        month,
        /* "YYYY-MM" — what the grid's cross-fade is keyed on, since a Date's identity moves for
         * reasons that are not a change of month. */
        monthKey,
        days,
        selected,
        entries,
        hasCalendar,
        away,
        /* `month` or `day` — the two are never on screen together. See the store. */
        view,
        openDay,
        closeDay,
        nextDay,
        previousDay,
        next,
        previous,
        today,
        /* Covers both waits — the moment before a group has resolved is as much "nothing to
         * show" as the fetch itself, and letting the first fall through flashes an empty
         * month. */
        skeleton: resolvingOrg || !ready,
    }), [
        month, monthKey, days, selected, entries, hasCalendar, view, away,
        openDay, closeDay, nextDay, previousDay, next, previous, today,
        resolvingOrg, ready,
    ])
}
