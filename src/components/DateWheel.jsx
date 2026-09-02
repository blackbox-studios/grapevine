"use client"

import { useCallback, useMemo } from "react"

import { Wheel, WheelColumn } from "@/components/Wheel"
import { MONTHS } from "@/lib/constants"

/* A date on the drum: day, month and year as three of <Wheel/>'s columns.
 *
 * **Why not `<input type="date">`.** The native control is a different object on every
 * platform — a calendar popover on desktop Chrome, a sheet on iOS Safari, and something
 * else again inside the Capacitor WebView — so the one screen every member sees on their
 * first day would look accidental. This is the same control everywhere, and it is the right
 * shape for the question: a birthday is chosen by scrubbing to a year, not by paging a
 * calendar back three hundred months. */

/* Last day of a given month, which is the whole reason day is clamped on every change:
 * scrolling from 31 March to February must not leave you on 31 February. */
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()

/* `value` / `onChange` speak ISO `YYYY-MM-DD`, so the control drops straight into a form
 * that already stores dates that way and nothing above it has to know about drums.
 *
 * `hideYear` drops the year column and nothing else — the value still carries a year, which the
 * caller supplies and strips. That is what lets a name day (a month and a day, recurring) use
 * this control rather than a second one: see the `precision` note in <DatePicker/>. */
const DateWheel = ({ value, onChange, minYear = 1900, maxYear, disabled, hideYear = false }) => {
    const ceilingYear = maxYear ?? new Date().getFullYear()

    /* Parsed from the ISO string rather than held as separate state, so there is one
     * source of truth and the control cannot disagree with the form it belongs to. */
    const [year, month, day] = useMemo(() => {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "")
        if (!match) {
            const now = new Date()
            /* Defaults to thirty years ago rather than today. A birthday drum that opens on
             * the current date invites someone to tap straight past it and submit a
             * birthday of today, which is both wrong and passes every validation rule. */
            return [now.getFullYear() - 30, now.getMonth(), now.getDate()]
        }
        return [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
    }, [value])

    const years = useMemo(
        () =>
            Array.from({ length: ceilingYear - minYear + 1 }, (_, offset) => {
                const y = minYear + offset
                return { key: y, label: String(y) }
            }),
        [minYear, ceilingYear],
    )

    const months = useMemo(
        () => MONTHS.map((name, monthIndex) => ({ key: monthIndex, label: name })),
        [],
    )

    const days = useMemo(
        () =>
            Array.from({ length: daysInMonth(year, month) }, (_, offset) => ({
                key: offset + 1,
                label: String(offset + 1),
            })),
        [year, month],
    )

    /* Every change goes through here so the day is clamped in one place. Changing the
     * month or the year can shorten the month underneath the current day — 31 → February
     * is the obvious case, and 29 February → a non-leap year is the one that gets missed. */
    const emit = useCallback(
        (next) => {
            const y = next.year ?? year
            const m = next.month ?? month
            const d = Math.min(next.day ?? day, daysInMonth(y, m))
            onChange(
                `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
            )
        },
        [year, month, day, onChange],
    )

    return (
        <Wheel disabled={disabled}>
            <WheelColumn
                label="Day"
                items={days}
                index={day - 1}
                onIndex={(index) => emit({ day: index + 1 })}
            />
            <WheelColumn
                label="Month"
                items={months}
                index={month}
                onIndex={(index) => emit({ month: index })}
                itemClassName="text-base"
            />
            {!hideYear && (
                <WheelColumn
                    label="Year"
                    items={years}
                    index={Math.max(0, year - minYear)}
                    onIndex={(index) => emit({ year: minYear + index })}
                />
            )}
        </Wheel>
    )
}

export default DateWheel
