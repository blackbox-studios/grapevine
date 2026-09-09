"use client"

import { useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"

import Badge from "@/components/Badge"
import Icon from "@/components/Icon"
import SignupClaim from "@/components/SignupClaim"
import Transition from "@/components/Transition"
import { CalendarSkeleton } from "@/components/Skeleton"
import { Button } from "@/components/ui/button"
import { CALENDAR_ENTRY, MONTHS } from "@/lib/constants"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { useCalendar } from "@/lib/store/calendar/hook"
import { useOrgNav } from "@/lib/store/org/hook"
import { SLIDE_TRANSITION, cn, dateFromKey, formatDayHeading, formatTime, formatTimeRange, slotTally } from "@/lib/utils"

/* The parish's month, and one of its days — never both at once.
 *
 * ── Two surfaces, not one screen with a panel ────────────────────────────────
 *
 * A grid with a day's events underneath it is two screens stacked, and on a phone it is a grid
 * you scroll past to reach the thing you just tapped. So tapping a square *goes* to that day,
 * and the day has a way back and its own arrows. The month stays loaded behind it — a day is a
 * slice of a window already in memory — so both directions are instant.
 *
 * ── The month: one grid, two rings ───────────────────────────────────────────
 *
 * A square says only that *something* of a kind is happening on it, never how much. Two
 * concentric rings — inner for the parish's own calendar, outer for a sign-up — so a Sunday
 * with a Liturgy and a coffee-hour rota wears both without either becoming a badge. The outer
 * one is filled rather than tinted when the viewer is on that date themselves, which is the one
 * thing worth making louder: this is the screen somebody opens to remember what they promised.
 *
 * `monthGrid` returns forty-two squares whatever the month, so a February that fits in five
 * rows still draws six. A grid that changed height would move everything under it on every
 * page, which reads as the page having reloaded.
 */

const PARISH_RING = "border-link/70"
const SIGNUP_RING = "ring-1 ring-offset-2 ring-offset-background"

/* **Today is the only square that is marked.** There is no selection to show: tapping a square
 * navigates to that day, so nothing on this grid is ever "chosen and still here" — a filled
 * circle left behind after coming back would be marking history rather than state. */
const DayCell = ({ day, onOpen }) => (
    <button
        type="button"
        onClick={() => onOpen(day.key)}
        aria-label={`${formatDayHeading(day.date)}${day.count ? `, ${day.count} events` : ""}`}
        className={cn(
            "relative grid aspect-square place-items-center rounded-full text-sm transition-colors",
            day.inMonth ? "text-foreground" : "text-muted-foreground/40",
            day.inMonth && "hover:bg-accent",
        )}
    >
        <span
            className={cn(
                "grid aspect-square w-full max-w-11 place-items-center rounded-full border border-transparent tabular-nums transition-colors",
                day.parish && day.inMonth && PARISH_RING,
                day.signup && day.inMonth && SIGNUP_RING,
                day.signup && day.inMonth && (day.mine ? "ring-brand" : "ring-brand/35"),
                day.isToday && "bg-foreground font-semibold text-background",
            )}
        >
            {day.day}
        </span>
    </button>
)

/* ---------------------------------------------------------------------------
 * The day
 * ------------------------------------------------------------------------- */

/* Height of one hour on the rail.
 *
 * Generous, and it can be: collapsing the empty stretches (see `clusters`) means the rail only
 * ever draws hours something happens in, so there is room to give those hours air instead of
 * spending it on an empty night. */
const HOUR = 72

/* The shortest a block may be drawn.
 *
 * A half-hour service is 36px at the scale above, which is not enough for a title and a time
 * without the two colliding — so a short event is drawn taller than its duration and slightly
 * overlaps the hour below it. That is the right way round: a block that cannot be read is worse
 * than one a few minutes out of scale, and the time is written inside it anyway. */
const MIN_BLOCK = 54

/* How long a stretch of nothing has to be before the rail folds it away.
 *
 * Ninety minutes: shorter than the gap between a Liturgy and a coffee hour, so the two stay on
 * one continuous rail and the reader can see they are back to back. Longer, and there is
 * genuinely nothing in between worth scrolling through. */
const GAP_MINUTES = 90

const minutesOf = (value) => {
    const date = new Date(value)
    return date.getHours() * 60 + date.getMinutes()
}

/* A day's timed entries, cut into runs with the empty stretches taken out.
 *
 * ── Why the rail is not one continuous strip of 24 hours ─────────────────────
 *
 * Nothing happens in a parish between ten at night and six in the morning, and a rail that drew
 * those hours would be two screens of ruled emptiness above the first thing anybody came to
 * see. Every calendar that shows a day solves this the same way, and so does this one: the
 * hours are only drawn where something is in them, and the stretches between runs are replaced
 * by a labelled break saying how much was skipped. Nothing is hidden — the break names its own
 * size, so the day is still legible as a day.
 *
 * Each run is padded by half an hour at either end so a block does not start flush against the
 * first hairline, and snapped out to whole hours so the labels are whole hours.
 *
 * ── Overlaps ────────────────────────────────────────────────────────────────
 *
 * Within a run, entries in start order each take the first lane whose previous entry has
 * finished, so two things at once end up side by side. It is not the general interval-graph
 * colouring a full calendar needs, and it does not have to be: a parish has a Liturgy and a
 * coffee hour, not a conference track. */
const useRail = (entries) => useMemo(() => {
    const timed = entries
        .filter((entry) => !entry.allDay)
        .map((entry) => {
            const from = minutesOf(entry.startsAt)
            const raw = minutesOf(entry.endsAt)
            /* An entry running past midnight is clamped to the end of the day rather than
             * wrapping: the rail draws one day, and a vigil ending at one in the morning
             * belongs to tomorrow's square as much as to this one. */
            const to = raw <= from ? 24 * 60 : Math.min(24 * 60, raw)
            return { entry, from, to }
        })
        .sort((a, b) => a.from - b.from)

    if (timed.length === 0) return []

    /* Runs: a new one begins wherever the gap since everything before it is long enough to be
     * worth folding away. `reach` is the furthest any entry so far extends, not merely the
     * previous one's end — an all-morning kitchen shift must not be cut in half by a short
     * event that starts inside it. */
    const runs = []
    let current = null
    let reach = -Infinity

    for (const item of timed) {
        if (!current || item.from - reach > GAP_MINUTES) {
            current = { items: [], from: item.from, to: item.to }
            runs.push(current)
        }
        current.items.push(item)
        current.to = Math.max(current.to, item.to)
        reach = Math.max(reach, item.to)
    }

    /* Snapped to whole hours, and then merged where the snapping has closed the gap.
     *
     * Two things depend on doing this before anything is measured. A break has to be reported
     * between the boundaries actually *drawn* — a gap of a hundred minutes leaves forty once
     * both runs have taken their half-hour of padding, and a label claiming the hundred would
     * be describing space that is not on screen. And two runs whose padding meets are one
     * continuous rail, so they have to become one run rather than two boxes with a seam between
     * them and nothing to say about it. */
    const drawn = []
    for (const run of runs) {
        const start = Math.max(0, Math.floor((run.from - 30) / 60) * 60)
        const end = Math.min(24 * 60, Math.ceil((run.to + 30) / 60) * 60)
        const previous = drawn[drawn.length - 1]

        if (previous && start <= previous.end) {
            previous.items.push(...run.items)
            previous.end = Math.max(previous.end, end)
        } else {
            drawn.push({ items: [...run.items], start, end })
        }
    }

    return drawn.map((run, index) => {
        const { start, end } = run

        const laneEnds = []
        const rows = run.items.map(({ entry, from, to }) => {
            let lane = laneEnds.findIndex((finish) => finish <= from)
            if (lane === -1) {
                lane = laneEnds.length
                laneEnds.push(to)
            } else {
                laneEnds[lane] = to
            }

            return {
                entry,
                lane,
                top: ((from - start) / 60) * HOUR,
                height: Math.max(((to - from) / 60) * HOUR, MIN_BLOCK),
            }
        })

        return {
            key: `${start}-${end}`,
            hours: Array.from({ length: (end - start) / 60 }, (_, i) => start / 60 + i),
            rows,
            lanes: Math.max(1, laneEnds.length),
            /* Minutes of rail the break stands in for. Null on the first run, which has nothing
             * before it; every other run is here precisely because its gap survived the merge
             * above, so there is always something to report. */
            skipped: index === 0 ? null : start - drawn[index - 1].end,
        }
    })
}, [entries])

/* One entry, as a block on the rail. A sign-up is a button — tapping it is how you take the
 * place — and a parish event is not, because there is nothing to do to it. */
const RailEntry = ({ entry, top, height, lane, lanes, onOpen }) => {
    const signup = entry.kind === CALENDAR_ENTRY.SIGNUP

    const body = (
        <span
            className={cn(
                "flex h-full flex-col justify-center overflow-hidden rounded-xl border-l-3 px-3 py-2 text-left",
                signup
                    ? "border-l-brand bg-brand/8"
                    : "border-l-link bg-link/8",
                signup && entry.mine && "bg-brand/16",
                entry.canceled && "opacity-50",
            )}
        >
            <span
                className={cn(
                    "truncate text-sm font-semibold text-foreground",
                    entry.canceled && "line-through",
                )}
            >
                {entry.title}
            </span>
            <span className="truncate text-xs text-muted-foreground">
                {signup
                    ? entry.canceled
                        ? "Cancelled"
                        : entry.mine
                            ? "You are signed up"
                            : slotTally(entry)
                    : formatTimeRange(entry.startsAt, entry.endsAt)}
            </span>
        </span>
    )

    return (
        <div
            className="absolute px-0.5"
            style={{
                top: `${top}px`,
                height: `${height}px`,
                left: `${(lane / lanes) * 100}%`,
                width: `${100 / lanes}%`,
            }}
        >
            {signup ? (
                <button
                    type="button"
                    onClick={() => onOpen(entry)}
                    className="h-full w-full cursor-pointer"
                >
                    {body}
                </button>
            ) : (
                body
            )}
        </div>
    )
}

/* A band of badges across the top of the day, for the entries that have no hour to be drawn
 * in: a feast is true of the whole day rather than of a stretch of it.
 *
 * **Colour-hashed from the title**, through the same `<Badge/>` a vocation uses. One flat
 * colour for all of them says only "this is an all-day thing", which the position already says;
 * hashing means a feast and a fast on the same day are visibly two different things, and the
 * same feast is the same colour every year somebody looks at it. */
const AllDayBand = ({ entries }) => {
    const allDay = entries.filter((entry) => entry.allDay)
    if (allDay.length === 0) return null

    return (
        <div className="flex flex-col gap-2">
            {allDay.map((entry) => (
                /* Full width, and left-aligned rather than centred: it is a band across the day
                   in the same way the blocks below are bands across their hours, and a pill
                   hugging its own text reads as a tag on something rather than as the thing
                   itself. */
                <Badge key={entry.id} className="h-8 w-full justify-start px-4 text-xs">
                    {entry.title}
                </Badge>
            ))}
        </div>
    )
}

const DayRail = ({ entries, onOpen }) => {
    const runs = useRail(entries)

    return (
        <div className="flex flex-col gap-6">
            {/* The runs butt together — no gap on *this* box, which is what puts the dashed
                line exactly where the solid hour line would have been. A fold is marked by the
                hour's own rule being dashed rather than by a second rule drawn above it, so the
                rail stays one continuous column of hours. The labels do the rest: 2 PM followed
                by 4 PM over a dotted line is the whole of "two hours were skipped here", and it
                needs no words. */}
            <div>
            {runs.map((run) => (
                <div key={run.key} className="relative">
                    {run.hours.map((hour, index) => (
                        /* `w-12` and a `gap-2`, together the `left-14` the block layer is inset
                           by — the three have to agree or the lines and the blocks stop meeting.
                           
                           **Sized to the widest label and no wider.** Every pixel of gutter is a
                           pixel the day itself does not get, and a wide one leaves the labels
                           floating in the middle of an empty column instead of sitting against
                           the lines they mark. "12 PM" is the longest thing that goes here. */
                        <div key={hour} className="flex h-18 items-start gap-2">
                            {/* **Left-aligned**, so every label starts on the surface's own left
                                edge — the same edge the all-day badges above run from. Right
                                alignment is the usual choice for an hour rail and it is the
                                wrong one here: it ends the labels flush against the lines but
                                starts a short one ("5 PM") a character in from a long one
                                ("12 PM"), which against a full-width badge directly above reads
                                as the column being indented for no reason. The ragged right edge
                                it trades for is bounded by one character and sits against empty
                                gutter, where nothing lines up with it anyway.

                                Pulled up so it sits *on* the line rather than above it — the eye
                                follows it across to the block that starts there. */}
                            <span className="w-12 shrink-0 -translate-y-1.5 text-left text-xs text-muted-foreground tabular-nums">
                                {formatTime(new Date(2000, 0, 1, hour))}
                            </span>
                            <span
                                className={cn(
                                    "flex-1",
                                    index === 0 && run.skipped !== null
                                        ? "border-t border-dashed border-border"
                                        : "h-px bg-border",
                                )}
                            />
                        </div>
                    ))}

                    {/* The blocks, in their own layer inset past the hour gutter, so they
                        position against one continuous box rather than inside a row. */}
                    <div className="absolute inset-y-0 left-14 right-0">
                        {run.rows.map(({ entry, lane, top, height }) => (
                            <RailEntry
                                key={entry.id}
                                entry={entry}
                                top={top}
                                height={height}
                                lane={lane}
                                lanes={run.lanes}
                                onOpen={onOpen}
                            />
                        ))}
                    </div>
                </div>
            ))}
            </div>
        </div>
    )
}

/* What the viewer themselves is standing for on this day, said in words above the rail.
 *
 * A claimed block is drawn differently down on the rail, but that is a property of one block
 * among several and is only found by reading every block on the day. The question somebody
 * opens a date to answer is "am I on for anything", so the day answers it by name, under the
 * heading that has just said which day it is.
 *
 * Cancelled claims are left out. The block keeps them, struck through, because a volunteer has
 * to see that the thing they promised is off, and a line at the top saying they are signed up
 * for it would say the opposite. */
const ClaimedNotice = ({ entries }) => {
    const titles = entries
        .filter((entry) => entry.mine && !entry.canceled)
        .map((entry) => entry.title)

    if (titles.length === 0) return null

    /* Hand-joined rather than `Intl.ListFormat`, which would make this the one string on the
     * surface that changes with the device's locale while everything around it stays as
     * written. */
    const names = titles.length === 1
        ? titles[0]
        : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`

    return (
        <div className="flex items-center gap-3 rounded-xl bg-brand/10 px-4 py-3">
            <Icon size="lg" className="shrink-0 text-brand">check_circle</Icon>
            <p className="text-sm text-muted-foreground">
                You are signed up for{" "}
                <span className="font-semibold text-foreground">{names}</span>
            </p>
        </div>
    )
}

/* One day: its heading, the way back to the month, and the rail.
 *
 * A component rather than a branch of the render, because it registers Android's back gesture —
 * a hook has to be at the top of something. Without it, backing out of a day would leave the app
 * from a screen the reader thinks they are one level into. Mounted only while the day is on
 * screen, so the handler's lifetime is exactly the surface's. */
const DayView = ({ selected, entries, onBack, onPrevious, onNext, onOpen }) => {
    useBackHandler(true, onBack)

    return (
        /* The date names the surface and everything under it belongs to that date, so the gap
           here is wider than any gap inside the rail. It has to match the month's, below: the
           two are one surface a reader steps between, and a heading that landed in a different
           place on a day than on the month would read as the page having changed shape. */
        <div className="flex flex-col gap-10">
            <header className="flex items-center gap-2">
                <Button className="-ml-2.5" variant="ghost" size="icon" onClick={onBack} aria-label="Back to the month">
                    <Icon size="lg">arrow_back</Icon>
                </Button>

                <h2 className="flex-1 truncate text-xl font-medium text-foreground">
                    {formatDayHeading(dateFromKey(selected))}
                </h2>

                <Button variant="ghost" size="icon" onClick={onPrevious} aria-label="Previous day">
                    <Icon size="lg">chevron_left</Icon>
                </Button>
                {/* Out to the same edge the month's chevrons reach, and gated the same way,
                    because stepping between the two surfaces must not move them. */}
                <Button
                    className="-mr-2 md:mr-0"
                    variant="ghost"
                    size="icon"
                    onClick={onNext}
                    aria-label="Next day"
                >
                    <Icon size="lg">chevron_right</Icon>
                </Button>
            </header>

            {/* Keyed on the day, so stepping through them cross-fades rather than swapping the
                rail out from under the reader — the same treatment the surface itself gets one
                level up. */}
            <AnimatePresence mode="wait" initial={false}>
                <Transition fast key={selected}>
                    {entries.length === 0 ? (
                        <div className="flex flex-col items-center gap-1 py-20 text-center">
                            <p className="text-sm text-muted-foreground">Nothing on this day.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            {/* Inside the cross-fade with the rail, so stepping to the next
                                day carries all three across together. */}
                            <ClaimedNotice entries={entries} />
                            <AllDayBand entries={entries} />
                            <DayRail entries={entries} onOpen={onOpen} />
                        </div>
                    )}
                </Transition>
            </AnimatePresence>
        </div>
    )
}

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"]

/* The key to the two colours, pinned to the foot of the screen.
 *
 * ── Why it is pinned, and why it is portalled ────────────────────────────────
 *
 * The month and the day are colour-coded the same way, and the day's rail is where a reader is
 * most likely to need reminding which is which — so the key has to be in the same place on both,
 * and has to stay there. In the flow (or `sticky`, which is the flow until there is overflow to
 * pin against) it lands wherever the content happens to end, which moves it every time the view
 * changes and every time a month has more or fewer events than the last.
 *
 * So it is `fixed` — and therefore portalled to `<body>`, which is not decoration. A `fixed`
 * element is positioned against the nearest **transformed** ancestor rather than the viewport,
 * and this surface sits inside two candidates: the shell's scroll container, which the group
 * switcher and every slide route translate, and the layout-projection root inside it. Whether
 * either carries a transform at rest is a framer-motion implementation detail, so the insets
 * below would be measured against a box that changes underneath them. Portalling puts the
 * question beyond doubt: the containing block is the viewport, and `--bottombar` means the
 * mobile rail's height exactly as it does everywhere else in the app.
 *
 * Leaving the flow costs it two things it would otherwise inherit, and both have to be paid
 * back by hand. It no longer escapes with the tab it belongs to — an inactive `<TabsContent/>`
 * is transparent and inert, and a portalled child of `<body>` is neither — so the *page*
 * renders this, and only while the calendar is the tab on screen. And it no longer travels with
 * the group switcher's push, so it takes the same `shift` on the same curve the mobile rail
 * does: this is a key to the colours on the grid, and a key that stayed put while the grid slid
 * out from under it would read as belonging to the panel.
 *
 * A rule rather than a dot, because that is the shape the colour actually takes on the rail: the
 * accent down a block's left edge. */
export const CalendarLegend = () => {
    const { hasCalendar, skeleton } = useCalendar()
    const { shift } = useOrgNav()
    const mounted = useMounted()

    /* Nothing to portal into during the static export's prerender, and nothing worth showing
     * over a skeleton. */
    if (!mounted || skeleton) return null

    return createPortal(
        <motion.div
            animate={{ x: shift }}
            transition={SLIDE_TRANSITION}
            className="pointer-events-none fixed inset-x-0 bottom-(--bottombar) z-20 flex items-center justify-center gap-5 bg-background/85 py-3 text-xs text-muted-foreground backdrop-blur-md md:bottom-0 md:left-(--nav-width)"
        >
            <span className="flex items-center gap-2">
                <span className="h-px w-6 rounded-full bg-link" />
                {hasCalendar ? "Parish calendar" : "Parish calendar (not set up)"}
            </span>
            <span className="flex items-center gap-2">
                <span className="h-px w-6 rounded-full bg-brand" />
                Sign-ups
            </span>
        </motion.div>,
        document.body,
    )
}

const EventsCalendar = () => {
    const {
        month, monthKey, days, selected, entries, view, away,
        openDay, closeDay, nextDay, previousDay,
        next, previous, today, skeleton,
    } = useCalendar()

    /* Which sign-up the claim surface is about. Component state: it is opened from one place —
     * a block on this rail — and closes with it. */
    const [taking, setTaking] = useState(null)

    /* A block carries the slot's own shape already (`slotId`, capacity, the viewer's claim id),
     * so the sign-up surface needs no rota loaded behind it and no second request. */
    const openClaim = useCallback((entry) => {
        setTaking({
            slot: {
                id: entry.slotId,
                sheetId: entry.sheetId,
                startsAt: entry.startsAt,
                endsAt: entry.endsAt,
                capacity: entry.capacity,
                taken: entry.taken,
                spotsLeft: entry.spotsLeft,
                canceled: entry.canceled,
                open: entry.open,
                mine: entry.mine,
            },
            title: entry.title,
        })
    }, [])

    return (
        <div className="flex flex-col pb-14">
            <AnimatePresence mode="wait" initial={false}>
                {skeleton ? (
                    <Transition fast key="skeleton">
                        <CalendarSkeleton />
                    </Transition>
                ) : view === "day" ? (
                    <Transition fast key="day">
                        <DayView
                            selected={selected}
                            entries={entries}
                            onBack={closeDay}
                            onPrevious={previousDay}
                            onNext={nextDay}
                            onOpen={openClaim}
                        />
                    </Transition>
                ) : (
                    <Transition fast key="month">
                        {/* `gap-10` is the month's heading standing clear of its grid, and it is
                           the same figure `<DayView/>` and `<CalendarSkeleton/>` use — all three
                           are the same heading in the same place, and a reader stepping between
                           them must not see it move. */}
                        <div className="flex flex-col gap-10">
                            {/* The header sits outside the fade below: paging is a change of
                                month, not of the controls that page it, and arrows that faded
                                out under the thumb pressing them would read as the whole screen
                                reloading. Same split the day view makes. */}
                            <header className="flex items-center justify-between gap-2">
                                <h2 className="text-2xl font-semibold text-foreground">
                                    {month ? MONTHS[month.getMonth()] : ""}{" "}
                                    <span className="text-muted-foreground">
                                        {month?.getFullYear()}
                                    </span>
                                </h2>

                                {/* Pulled out to the same edge the grid below now reaches, so
                                    the chevron sits over the Saturday column rather than short
                                    of it. Mobile only, like the bleed it is following. */}
                                <div className="-mr-2 flex items-center gap-1 md:mr-0">
                                    {/* Only once the reader has paged away from it. On the
                                        current month it is a button that does nothing. */}
                                    {away && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={today}
                                            className="px-3 text-xs"
                                        >
                                            Today
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={previous}
                                        aria-label="Previous month"
                                    >
                                        <Icon size="lg">chevron_left</Icon>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={next}
                                        aria-label="Next month"
                                    >
                                        <Icon size="lg">chevron_right</Icon>
                                    </Button>
                                </div>
                            </header>

                            {/* Wider than the shell's mobile gutter allows: seven columns is
                                the one layout on this surface whose cell size is decided by
                                division, so every pixel the gutter keeps comes off each square.
                                Half of it is given back rather than all, because the sign-up
                                ring is drawn outside its circle and an edge column flush with
                                the screen has that ring shaved. Desktop keeps the gutter, its
                                column being capped at 640px anyway. */}
                            <div className="-mx-2 md:mx-0">
                                <div className="grid grid-cols-7">
                                    {WEEKDAY_INITIALS.map((initial, index) => (
                                        <span
                                            key={index}
                                            className="pb-2 text-center text-xxs font-medium text-muted-foreground"
                                        >
                                            {initial}
                                        </span>
                                    ))}
                                </div>

                                {/* Keyed on the month, so paging cross-fades the squares. The
                                    weekday row above is the same in every month and stays put,
                                    which is what keeps the fade reading as the dates changing
                                    rather than the calendar being rebuilt. */}
                                <AnimatePresence mode="wait" initial={false}>
                                    <Transition fast key={monthKey}>
                                        <div className="grid grid-cols-7 gap-y-1">
                                            {days.map((day) => (
                                                <DayCell
                                                    key={day.key}
                                                    day={day}
                                                    onOpen={openDay}
                                                />
                                            ))}
                                        </div>
                                    </Transition>
                                </AnimatePresence>
                            </div>

                        </div>
                    </Transition>
                )}
            </AnimatePresence>



            <SignupClaim
                slot={taking?.slot ?? null}
                title={taking?.title ?? ""}
                onOpenChange={(open) => {
                    if (!open) setTaking(null)
                }}
            />
        </div>
    )
}

export default EventsCalendar
