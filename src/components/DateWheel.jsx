"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"

import { MONTHS } from "@/lib/constants"
import { cn } from "@/lib/utils"

/* An iOS-style drum picker for a date: day, month, year as three snapping columns with the
 * selection held in a pill at the centre.
 *
 * **Why not `<input type="date">`.** The native control is a different object on every
 * platform — a calendar popover on desktop Chrome, a sheet on iOS Safari, and something
 * else again inside the Capacitor WebView — so the one screen every member sees on their
 * first day would look accidental. This is the same control everywhere, and it is the right
 * shape for the question: a birthday is chosen by scrubbing to a year, not by paging a
 * calendar back three hundred months.
 *
 * The snapping is CSS (`scroll-snap-type` / `scroll-snap-align`), not JavaScript, so the
 * momentum and rubber-banding are the platform's own and it feels native on a phone. JS
 * only reads where the scroll settled. */

const ITEM_HEIGHT = 40
/* Odd, so there is a true centre row to align the pill to. */
const VISIBLE = 5
const PAD = ((VISIBLE - 1) / 2) * ITEM_HEIGHT

/* Last day of a given month, which is the whole reason day is clamped on every change:
 * scrolling from 31 March to February must not leave you on 31 February. */
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()

const WheelColumn = ({ items, index, onIndex, label, itemClassName }) => {
    const ref = useRef(null)
    const settling = useRef(null)

    /* Keep the scroll position in step with the value, including when another column
     * clamps this one. The tolerance check is what stops this fighting the user's own
     * scroll — without it, every settle would re-trigger a scroll to where it already is. */
    useEffect(() => {
        const element = ref.current
        if (!element) return
        const target = index * ITEM_HEIGHT
        if (Math.abs(element.scrollTop - target) > 1) element.scrollTop = target
    }, [index])

    useEffect(() => () => clearTimeout(settling.current), [])

    /* Read the selection only once scrolling has stopped. Reacting to every scroll event
     * would fire a change per frame during a fling, and on a clamped column that turns
     * into a visible fight between the user and the correction. */
    const handleScroll = useCallback(() => {
        clearTimeout(settling.current)
        settling.current = setTimeout(() => {
            const element = ref.current
            if (!element) return
            const next = Math.min(
                items.length - 1,
                Math.max(0, Math.round(element.scrollTop / ITEM_HEIGHT)),
            )
            if (next !== index) onIndex(next)
        }, 110)
    }, [items.length, index, onIndex])

    return (
        <div
            ref={ref}
            onScroll={handleScroll}
            role="listbox"
            aria-label={label}
            tabIndex={0}
            className="relative z-10 h-full flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain scrollbar-none focus-visible:outline-none"
            style={{
                /* Fades the ends so the column reads as a drum rather than a cropped list.
                 * A mask rather than overlaid gradients, which would need to match the
                 * background and would break the moment the theme changed. */
                maskImage:
                    "linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)",
                WebkitMaskImage:
                    "linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)",
                scrollbarWidth: "none",
            }}
        >
            {/* Half a viewport of padding at each end, so the first and last values can
              * reach the centre line. */}
            <div style={{ height: PAD }} aria-hidden="true" />

            {items.map((item, itemIndex) => (
                <div
                    key={item.key ?? item.label}
                    role="option"
                    aria-selected={itemIndex === index}
                    onClick={() => onIndex(itemIndex)}
                    className={cn(
                        "flex snap-center items-center justify-center text-lg tabular-nums transition-[color,opacity] duration-150 select-none",
                        itemIndex === index
                            ? "font-medium text-foreground"
                            : "cursor-pointer text-muted-foreground/70",
                        itemClassName,
                    )}
                    style={{ height: ITEM_HEIGHT }}
                >
                    {item.label}
                </div>
            ))}

            <div style={{ height: PAD }} aria-hidden="true" />
        </div>
    )
}

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
        <div
            className={cn(
                "relative w-full select-none",
                disabled && "pointer-events-none opacity-50",
            )}
            style={{ height: VISIBLE * ITEM_HEIGHT }}
        >
            {/* The selection pill, behind the columns and spanning all three, so the centre
              * row reads as one selected value rather than three coincidences. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-1/2 z-0 -translate-y-1/2 rounded-2xl bg-muted"
                style={{ height: ITEM_HEIGHT }}
            />

            <div className="relative flex h-full items-stretch gap-1">
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
            </div>
        </div>
    )
}

export default DateWheel
