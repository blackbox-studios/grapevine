"use client"

import { useCallback, useMemo, useState } from "react"

import DateWheel from "@/components/DateWheel"
import Icon from "@/components/Icon"
import { KeyboardAwareColumn } from "@/components/KeyboardAware"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { FIELD_BOX } from "@/components/ui/input"
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { MONTHS } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { cn } from "@/lib/utils"

/* The one date control the app uses — a drum on a phone, a calendar on a desktop.
 *
 * **Why two.** The wheel exists because a native `<input type="date">` is a different
 * object on every platform, and because a birthday is chosen by scrubbing to a year rather
 * than paging a calendar back three hundred months (see the header of DateWheel.jsx). Both
 * of those arguments are about a phone. On a desktop the drum is the wrong shape for the
 * input device: a mouse wheel over three snapping columns is fiddly where a month grid is
 * one click, and there is room for the grid. So the control follows the pointer, the same
 * way the post view and the admissions sheet follow it between a dialog and a drawer.
 *
 * The swap is `useIsDesktop`, which is reactive — a resized window or a rotated tablet
 * flips the surface live, and the value survives it because the value is a string that
 * neither surface owns.
 *
 * **The contract is an ISO `YYYY-MM-DD` string**, in and out, matching what DateWheel
 * already spoke and what `/api/me/onboarding` stores in a `@db.Date`. Nothing above this
 * component handles a Date object, so nothing above it can pick up a timezone.
 *
 * Two shapes, because a date is asked for in two different situations:
 *
 *   `variant="inline"`   the surface itself, no trigger — for a screen whose whole job is
 *                        this one question (first-run orientation).
 *   `variant="popover"`  a button showing the current date that opens the surface — for a
 *                        field among other fields. Default.
 */

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/* ISO string → a local-midnight Date, which is what react-day-picker compares against.
 *
 * Built from parts rather than `new Date(iso)`, and that is not pedantry: the string form
 * is parsed as *UTC* midnight, so reading `.getDate()` back off it in any negative-offset
 * timezone yields the previous day. Someone born on the 1st would see the 31st selected. */
const toDate = (iso) => {
    const match = ISO_PATTERN.exec(iso ?? "")
    if (!match) return undefined
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return Number.isNaN(date.getTime()) ? undefined : date
}

/* Date → ISO string, read off the local parts for the same reason `toISOString()` is not
 * used here: that would re-encode a local midnight as the previous evening in UTC. */
const toISO = (date) => {
    if (!date) return ""
    return [
        String(date.getFullYear()).padStart(4, "0"),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-")
}

/* Spelled out rather than `toLocaleDateString`.
 *
 * The app prerenders to static HTML, and a locale-formatted date is one of the few things
 * that reliably differs between the build machine and the reader's browser — which is a
 * hydration mismatch on a control that has not been touched yet. This is deterministic, and
 * it matches the month names the drum already shows. */
const formatDate = (iso, precision) => {
    const match = ISO_PATTERN.exec(iso ?? "")
    if (!match) return ""
    const day = `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]}`
    return precision === MONTH_DAY ? day : `${day} ${match[1]}`
}

/* ---------------------------------------------------------------------------
 * Precision
 *
 * A birthday and an ordination are dates; a **name day is not**. It is a month and a day that
 * recurs, so there is no year to pick and none is stored — see the `nameDayMonth` note in
 * `prisma/schema.prisma`.
 *
 * It is a mode here rather than a second control because the difference between them is one
 * column of a drum, and two pickers standing in one column of fields are two things to keep
 * looking identical. So `precision` selects it, the wire carries `MM-DD`, and the year is pinned
 * out of sight.
 *
 * The pinned year is a **leap** year, and that is the one detail worth stating: St Cassian's
 * feast falls on 29 February, and any non-leap reference would quietly make it unpickable.
 * ------------------------------------------------------------------------- */

const MONTH_DAY = "month-day"
const REFERENCE_YEAR = 2024

const MONTH_DAY_PATTERN = /^(\d{2})-(\d{2})$/

/* The caller's value → the full ISO string the surfaces work in. */
const toFull = (value, precision) => {
    if (precision !== MONTH_DAY) return value
    const match = MONTH_DAY_PATTERN.exec(value ?? "")
    return match ? `${REFERENCE_YEAR}-${match[1]}-${match[2]}` : ""
}

/* ...and back, dropping the year the reader never saw. */
const fromFull = (iso, precision) => {
    if (precision !== MONTH_DAY) return iso
    const match = ISO_PATTERN.exec(iso ?? "")
    return match ? `${match[2]}-${match[3]}` : ""
}

/* The desktop surface. `captionLayout="dropdown"` is not decoration — it is what makes a
 * calendar usable for a birthday at all, since the alternative is clicking the previous-month
 * arrow four hundred times. The dropdowns are bounded by the same years the drum offers, so
 * the two controls cannot disagree about what is selectable. */
const CalendarSurface = ({ value, onChange, minYear, maxYear, disabled, monthDay, className }) => {
    const selected = useMemo(() => toDate(value), [value])

    const [startMonth, endMonth] = useMemo(
        () => [new Date(minYear, 0, 1), new Date(maxYear, 11, 31)],
        [minYear, maxYear],
    )

    return (
        <Calendar
            mode="single"
            selected={selected}
            /* Opens on the selected month, so a stored birthday is in view rather than
             * requiring the reader to navigate back to their own answer. */
            defaultMonth={selected ?? endMonth}
            onSelect={(date) => date && onChange(toISO(date))}
            /* The year dropdown is the whole reason a calendar is usable for a birthday, and
             * the whole reason it must not appear for a name day — there is no year to choose,
             * and offering one would ask a question the value cannot hold.
             *
             * The plain caption has to be overridden with it: react-day-picker's default
             * renders "March 2024", which would put the pinned reference year on screen — the
             * one place in this control where the year the reader is not choosing could still
             * be seen. The nav arrows cannot leave it either, because `startMonth`/`endMonth`
             * are both bounded to that year. */
            captionLayout={monthDay ? "label" : "dropdown"}
            formatters={
                monthDay
                    ? { formatCaption: (date) => MONTHS[date.getMonth()] }
                    : undefined
            }
            startMonth={startMonth}
            endMonth={endMonth}
            disabled={disabled ? () => true : undefined}
            className={cn("bg-transparent p-0", disabled && "opacity-50", className)}
        />
    )
}

const DatePicker = ({
    value,
    onChange,
    variant = "popover",
    /* "date" (`YYYY-MM-DD`) or "month-day" (`MM-DD`) — see the Precision note above. */
    precision = "date",
    minYear = 1900,
    maxYear,
    disabled,
    label = "Date",
    placeholder = "Pick a date",
    className,
}) => {
    const isDesktop = useIsDesktop()
    const [open, setOpen] = useState(false)

    const monthDay = precision === MONTH_DAY
    /* A recurring date is pinned to one reference year at both ends, so neither surface offers
     * a year to move to and the drum's day column still clamps against a real month length. */
    const floorYear = monthDay ? REFERENCE_YEAR : minYear
    const ceilingYear = monthDay ? REFERENCE_YEAR : (maxYear ?? new Date().getFullYear())

    /* Open/closed React state, not a URL, so Android's back gesture has nothing of its own
     * to unwind and would close the app from on top of the sheet. */
    useBackHandler(open && !isDesktop, () => setOpen(false))

    const handleChange = useCallback(
        (next) => {
            onChange?.(fromFull(next, precision))
            /* The calendar answers the question in one click, so it closes itself. The drum
             * does not — every scrubbed column would slam the sheet shut mid-choice — so it
             * waits for Done. */
            if (isDesktop) setOpen(false)
        },
        [onChange, isDesktop, precision],
    )

    /* Both surfaces work in full ISO throughout; only the edges translate. */
    const full = toFull(value, precision)

    const surface = isDesktop ? (
        <CalendarSurface
            value={full}
            onChange={handleChange}
            minYear={floorYear}
            maxYear={ceilingYear}
            monthDay={monthDay}
            disabled={disabled}
        />
    ) : (
        <DateWheel
            value={full}
            onChange={handleChange}
            minYear={floorYear}
            maxYear={ceilingYear}
            hideYear={monthDay}
            disabled={disabled}
        />
    )

    if (variant === "inline") {
        return (
            <div
                className={cn(
                    "w-full",
                    /* The calendar sizes to its content; centring it keeps it under the
                     * heading on a screen built around this one question. */
                    isDesktop && "flex justify-center",
                    className,
                )}
            >
                {surface}
            </div>
        )
    }

    /* Shaped as a field, not as a button. It stands in a column of `<Input>`s, so it wears
     * `FIELD_BOX` — the same height, radius, fill and text indent — and only the chevron says
     * it opens something. `border-none` because <Button/>'s outline variant brings one and the
     * inputs beside it have none. */
    const trigger = (
        <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={label}
            onClick={isDesktop ? undefined : () => setOpen(true)}
            className={cn(
                FIELD_BOX,
                "justify-between border-none pr-4 font-normal",
                !value && "text-muted-foreground",
                className,
            )}
        >
            {full ? formatDate(full, precision) : placeholder}
            <Icon size="md" className="text-muted-foreground">
                calendar_month
            </Icon>
        </Button>
    )

    if (isDesktop) {
        return (
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                <PopoverContent align="start" className="w-auto rounded-3xl p-3">
                    {surface}
                </PopoverContent>
            </Popover>
        )
    }

    return (
        <>
            {trigger}
            {/* repositionInputs is off for the same reason as every other drawer here:
              * Vaul's implementation keeps react-aria's scroll lock installed, which
              * swallows touches inside the Capacitor WebView. */}
            <Drawer open={open} onOpenChange={setOpen} repositionInputs={false}>
                <DrawerContent className="max-h-[85dvh]">
                    <KeyboardAwareColumn>
                        <DrawerHeader className="shrink-0">
                            <DrawerTitle>{label}</DrawerTitle>
                        </DrawerHeader>
                        <div className="px-4">{open && surface}</div>
                        <div className="p-4">
                            <Button
                                type="button"
                                size="lg"
                                onClick={() => setOpen(false)}
                                className="w-full"
                            >
                                Done
                            </Button>
                        </div>
                    </KeyboardAwareColumn>
                </DrawerContent>
            </Drawer>
        </>
    )
}

export default DatePicker
