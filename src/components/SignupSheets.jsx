"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence } from "motion/react"
import { toast } from "sonner"

import Ripple from "@/assets/svg/ripple.svg"
import Hint from "@/components/Hint"
import Icon from "@/components/Icon"
import SignupClaim from "@/components/SignupClaim"
import SignupEditor from "@/components/SignupEditor"
import { RotaSkeleton, SignupsSkeleton } from "@/components/Skeleton"
import Transition from "@/components/Transition"
import { Avatar, ConfirmDialog, HandleLink } from "@/components/Widgets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MAX_SLOT_CAPACITY, ROUTES, SIGNUP_STATUS } from "@/lib/constants"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { useNow } from "@/lib/hooks/useNow.hook"
import { displayName } from "@/lib/name"
import { pushRoute } from "@/lib/hooks/useSlideRoute.hook"
import { useCurrentOrg } from "@/lib/store/org/hook"
import { useSheet } from "@/lib/store/sheet/hook"
import { useEventsView, useSignupAdmin, useSignups } from "@/lib/store/signups/hook"
import { cn, formatDayHeading, formatTimeRange, signupIdFor, signupPath, slotTallyParts } from "@/lib/utils"

/* The parish's rotas: reading them, taking a place on one, and — for an admin — running them.
 *
 * ── A rota is a place you go, not a drawer that opens ────────────────────────
 *
 * The list and one rota are two surfaces, the same way the month and one of its days are: you
 * tap a rota, you are on it, and there is an arrow back. That is what a rota is — a title, a
 * paragraph of instructions and twelve dates, which is a screen rather than something that
 * unfolds inside a list of other screens. An accordion also has to answer "what happens to the
 * others", and the honest answer here is that they should get out of the way entirely.
 *
 * Going there is **not a request**: the list ships every rota with its dates, so the `sheet`
 * store promotes it synchronously and refreshes behind it. See that store's header.
 *
 * ── One surface with two modes, not two pages ────────────────────────────────
 *
 * Administering a rota is a mode rather than a destination. A priest looking at Sunday and
 * noticing nobody has signed up should be able to add a place from where he is standing; the
 * list is identical either way, and what differs is only what each date *offers*. The switch is
 * in the page's header (`<ModeSwitch/>`), drawn only for an admin, and checked again in
 * `useEventsView` rather than trusted — a role can be revoked while the page is open. None of
 * it is a control: `requireMembership(..., { role: "ADMIN" })` is.
 */

/* The View / Edit switch, mounted by the Events page's header rather than by this component.
 *
 * **It lives with the title and stays there on both tabs.** A page-level control belongs in the
 * page's header, and keeping it put means it does not appear and disappear as the reader moves
 * between the calendar and the rotas — a control that comes and goes is one somebody has to go
 * looking for. On the calendar it has nothing to act on, which is the cheaper price.
 *
 * Drawn only for an admin of the selected group, and hidden rather than disabled for a member —
 * the visibility convention for anything above the base role. */
export const ModeSwitch = () => {
    const { editing, canEdit, setMode } = useEventsView()
    if (!canEdit) return null

    /* The same `<Tabs/>` selector the rest of the app uses, list only and no panels — which is
     * what a segmented control is. It brings the sliding indicator with it, so the active half
     * travels across on a switch rather than blinking from one to the other, and it means there
     * is one selector in this app rather than one plus a lookalike. */
    return (
        <Tabs
            value={editing ? "edit" : "view"}
            onValueChange={(value) => setMode(value === "edit" ? "edit" : "view")}
            className="shrink-0"
        >
            <TabsList>
                <TabsTrigger value="view" className="px-4">View</TabsTrigger>
                <TabsTrigger value="edit" className="px-4">Edit</TabsTrigger>
            </TabsList>
        </Tabs>
    )
}

/* One person on a date. The body they stand for takes the line if there is one, with their own
 * name underneath in small type — somebody still has to be answerable, and "OCF" alone leaves
 * nobody to ring. */
const ClaimRow = ({ claim }) => (
    <li className="flex items-center gap-2.5">
        <Avatar person={claim.person} className="size-6" />
        <span className="flex min-w-0 flex-col leading-tight">
            {claim.onBehalfOf ? (
                <>
                    <span className="truncate text-xs font-semibold text-foreground">
                        {claim.onBehalfOf}
                    </span>
                    <span className="truncate text-xxs text-muted-foreground">
                        <HandleLink person={claim.person}>
                            {displayName(claim.person)}
                        </HandleLink>
                    </span>
                </>
            ) : (
                <span className="truncate text-xs text-foreground">
                    <HandleLink person={claim.person}>
                        {displayName(claim.person)}
                    </HandleLink>
                </span>
            )}
            {claim.note && (
                <span className="truncate text-xxs text-muted-foreground">{claim.note}</span>
            )}
        </span>
    </li>
)

/* The date, its time, and its note — the half of a slot row that reads the same in both modes. */
const SlotWhen = ({ slot }) => (
    <div className="flex min-w-0 flex-1 flex-col pt-0.5">
        <span
            className={cn(
                "text-sm font-semibold text-foreground",
                slot.canceled && "line-through",
            )}
        >
            {formatDayHeading(slot.startsAt)}
        </span>
        <span className="text-xs text-muted-foreground">
            {formatTimeRange(slot.startsAt, slot.endsAt)}
            {slot.canceled ? " · Cancelled" : ""}
        </span>
        {slot.note && (
            <span className="pt-1 text-xs text-muted-foreground">{slot.note}</span>
        )}
    </div>
)

/* The count, in a ring that is also the gauge: the dots run from the top clockwise and are lit
 * as far as the date is subscribed, so a Sunday nobody has taken is visible from across the
 * column before the sentence beside it has been read.
 *
 * Two copies of one dotted circle, the lit one masked to an arc, so every dot sits in the same
 * place in both. The mask's stroke is wider than the dots it covers, which is what makes the
 * boundary land between two dots instead of shaving one down its side. */
const TallyRing = ({ taken, capacity }) => {
    const mask = useId()
    const filled = Math.max(0, Math.min(1, taken / capacity)) * 100
    const dots = { pathLength: 100, strokeDasharray: "0.1 4.9", strokeLinecap: "round" }

    return (
        <span className="relative flex size-6 shrink-0 items-center justify-center">
            <svg viewBox="0 0 24 24" className="absolute inset-0 size-full" aria-hidden="true">
                <mask id={mask}>
                    <circle
                        cx="12" cy="12" r="10.5" fill="none" stroke="white" strokeWidth="4"
                        pathLength="100" strokeDasharray={`${filled} 100`}
                        transform="rotate(-90 12 12)"
                    />
                </mask>
                <circle
                    cx="12" cy="12" r="10.5" fill="none" strokeWidth="1.5"
                    className="stroke-foreground/25" {...dots}
                />
                <circle
                    cx="12" cy="12" r="10.5" fill="none" strokeWidth="1.5"
                    className="stroke-foreground" mask={`url(#${mask})`} {...dots}
                />
            </svg>
            <span className="text-xxs font-semibold text-foreground">{taken}</span>
        </span>
    )
}

/* How full a date is. The sentence is `slotTallyParts`'s; what is local is the setting of it —
 * the count ringed and at full contrast against the rest of it muted, so a column of dates
 * reads as the numbers down its side. */
const SlotTally = ({ slot }) => {
    if (slot.canceled) return null
    const { full, rest } = slotTallyParts(slot)

    return (
        <span className="flex items-center justify-center gap-1.5 text-xs tabular-nums">
            {!full && <TallyRing taken={slot.taken} capacity={slot.capacity} />}
            <span className="text-muted-foreground">{rest}</span>
        </span>
    )
}

/* A date as a member reads it: how full it is, and the one button that matters. */
const SlotRow = ({ slot, sheet, onTake }) => {
    const now = useNow()
    const past = new Date(slot.endsAt).getTime() < now
    const closed = sheet.status !== SIGNUP_STATUS.OPEN
    const full = slot.spotsLeft === 0

    return (
        <li
            className={cn(
                "flex flex-col gap-3 px-2 py-6",
                slot.canceled && "opacity-60",
            )}
        >
            <div className="flex items-start gap-3">
                <SlotWhen slot={slot} />

                {/* Laid to a width rather than to its contents, so the pills and the
                    tallies line up down the list however each date has been answered. */}
                <div className=" flex w-28 shrink-0 flex-col items-center gap-1.5">
                    {/* **The filled pill is the date you are already on**, which is back to
                        front for a call to action and is the point: nothing else on a row says
                        the date is yours, and a filled shape is what carries that down a column
                        of dates. Take is an invitation rather than a state, and an outline is
                        enough to be tapped. */}
                    {slot.mine ? (
                        <Button
                            size="sm"
                            onClick={() => onTake(slot)}
                            className="w-full rounded-full"
                        >
                            Signed up
                        </Button>
                    ) : (
                        !slot.canceled && !past && !closed && !full && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onTake(slot)}
                                className="w-full rounded-full"
                            >
                                Take
                            </Button>
                        )
                    )}

                    <SlotTally slot={slot} />
                </div>
            </div>

            {slot.claims.length > 0 && (
                <ul className="flex flex-col gap-2 pl-1">
                    {slot.claims.map((claim) => (
                        <ClaimRow key={claim.id} claim={claim} />
                    ))}
                </ul>
            )}
        </li>
    )
}

/* The same date as an admin adjusts it: how many people it needs, and whether it is happening.
 *
 * Cancelling is the ordinary control and Remove is offered only for a date nobody has taken —
 * `updateSlot` and `deleteSlot` carry the reason. */
const ManageSlot = ({ slot }) => {
    const { saveSlot, cancelSlot, restoreSlot, removeSlot, working } = useSheet()
    const [capacity, setCapacity] = useState(String(slot.capacity))
    const [confirming, setConfirming] = useState(false)
    const now = useNow()

    const busy = Boolean(working[slot.id])
    const past = new Date(slot.endsAt).getTime() < now

    /* Committed on blur rather than on every keystroke — a field typed through 1, 12, 120 would
     * otherwise send three requests, and the middle one would briefly refuse itself for being
     * under what is already claimed. */
    const commitCapacity = useCallback(async () => {
        const next = Number(capacity)
        if (!Number.isInteger(next) || next < 1 || next > MAX_SLOT_CAPACITY) {
            setCapacity(String(slot.capacity))
            return
        }
        if (next === slot.capacity) return

        const result = await saveSlot(slot.id, { capacity: next })
        /* A refusal — cutting below what is already claimed — leaves the field showing a number
         * the server rejected, so it is put back to the truth. */
        if (!result) setCapacity(String(slot.capacity))
    }, [capacity, slot.capacity, slot.id, saveSlot])

    const remove = useCallback(async () => {
        if (await removeSlot(slot.id)) toast.success("Date removed.")
    }, [removeSlot, slot.id])

    return (
        <li
            className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-3 px-2 py-6",
                slot.canceled && "opacity-60",
                /* A date that has been is dimmed rather than outlined — there is no border left
                   to make dashed, and dimming says "past" without adding a second kind of edge
                   to a list held together by rules. */
                past && "opacity-70",
            )}
        >
            <SlotWhen slot={slot} />

            {slot.claims.length > 0 && (
                <span className="w-full truncate text-xs text-muted-foreground">
                    {slot.claims
                        .map((claim) => claim.onBehalfOf || displayName(claim.person))
                        .join(", ")}
                </span>
            )}

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{slot.taken} of</span>
                <Input
                    type="number"
                    min={1}
                    max={MAX_SLOT_CAPACITY}
                    inputMode="numeric"
                    value={capacity}
                    disabled={busy}
                    onChange={(event) => setCapacity(event.target.value)}
                    onBlur={commitCapacity}
                    aria-label="People needed"
                    className="h-9 w-18 text-center"
                />
                <span>taken</span>
            </label>

            <div className="flex items-center gap-1">
                {busy ? (
                    <Ripple aria-label="Saving" className="size-7 [&_circle]:stroke-current" />
                ) : (
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                slot.canceled ? restoreSlot(slot.id) : cancelSlot(slot.id)
                            }
                            className="px-3 text-xs"
                        >
                            {slot.canceled ? "Restore" : "Cancel"}
                        </Button>
                        {/* Offered only for a date nobody is on: the server refuses the rest,
                            and a button that exists to be refused should not be drawn. */}
                        {slot.claims.length === 0 && (
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setConfirming(true)}
                                aria-label="Remove this date"
                                className="text-muted-foreground"
                            >
                                <Icon size="sm">delete</Icon>
                            </Button>
                        )}
                    </>
                )}
            </div>

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Remove this date?"
                description={`${formatDayHeading(slot.startsAt)} will be taken off the sheet. Nobody has signed up for it.`}
                confirmLabel="Remove"
                onConfirm={remove}
            />
        </li>
    )
}

/* What this rota is called on the parish's own calendar, when that is not its own name.
 *
 * **Almost no rota needs this**, and the label plus the `(i)` say so without spending the room:
 * most sheets are for something internal — a kitchen shift, a cleaning rota — that is on no
 * public calendar at all, and a sheet that *is* on one folds into it automatically, because
 * `normalizeTitle` already sees past a possessive and a capital. What is left is the one case
 * where the parish calls it something else entirely.
 *
 * Committed on blur rather than per keystroke, like the capacity field: a title typed a letter
 * at a time would otherwise be a request a letter at a time. */
const CalendarMatch = ({ row }) => {
    const { save, saving } = useSheet()
    const [value, setValue] = useState(row.calendarTitle ?? "")

    const commit = useCallback(async () => {
        const next = value.trim()
        if (next === (row.calendarTitle ?? "")) return
        if (await save({ calendarTitle: next })) {
            toast.success(next ? "Calendar name saved." : "Back to matching on the rota's name.")
        }
    }, [value, row.calendarTitle, save])

    const matching = value.trim() || row.title
    const fieldId = `calendar-title-${row.id}`

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
                <label
                    htmlFor={fieldId}
                    className="pl-2 text-xs leading-none font-semibold text-foreground"
                >
                    Fold into parish calendar event
                </label>

                {/* The explanation is behind the `(i)` rather than under the box. It is two
                    sentences that matter once — the first time an admin wonders what this field
                    is — and printed in full they are longer than everything else in edit mode
                    put together, for a field almost nobody sets. `<Hint/>` opens on hover with a
                    pointer and on a tap without one. */}
                <Hint
                    side="top"
                    align="start"
                    content={
                        <span className="flex flex-col gap-2 text-left">
                            <span>
                                Rarely needed. Leave it blank unless this rota is on the parish
                                calendar under a different name. Most sign-up sheets are internal
                                and are on no calendar at all.
                            </span>
                            {/* The normalized form, because it is what actually decides — an
                                admin wondering why two entries did not fold together can see the
                                key that failed to match rather than guess the rule. */}
                            <span className="text-muted-foreground">
                                Folds into a calendar event called “{matching}” on the same day.
                            </span>
                        </span>
                    }
                >
                    <button
                        type="button"
                        aria-label="About folding into the parish calendar"
                        className="shrink-0 cursor-pointer rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <Icon size="sm">info</Icon>
                    </button>
                </Hint>
            </div>

            <Input
                id={fieldId}
                value={value}
                disabled={saving}
                placeholder={row.title}
                spellCheck={false}
                onChange={(event) => setValue(event.target.value)}
                onBlur={commit}
            />
        </div>
    )
}

/* The row of admin actions over a rota's dates: add more, close it, retire it. */
const SheetActions = ({ row }) => {
    const { save, extend, saving, close } = useSheet()
    const { remove } = useSignupAdmin()
    const [extending, setExtending] = useState(false)
    const [confirming, setConfirming] = useState(false)

    const closed = row.status !== SIGNUP_STATUS.OPEN

    const toggleStatus = useCallback(async () => {
        const next = closed ? SIGNUP_STATUS.OPEN : SIGNUP_STATUS.CLOSED
        if (await save({ status: next })) {
            toast.success(closed ? "Sheet reopened." : "Sheet closed to new sign-ups.")
        }
    }, [closed, save])

    const destroy = useCallback(async () => {
        if (await remove(row.id)) {
            toast.success(`${row.title} removed.`)
            /* Back to the list, because the rota this page is about no longer exists. */
            close()
        }
    }, [remove, row.id, row.title, close])

    return (
        /* No box around this. It is the page's own controls rather than a thing on the page, and
           a bordered panel holding three buttons and a disclosure reads as a widget dropped onto
           it. Pills to match the Take button, and the destructive one pushed to the far
           end with `ml-auto` — the same separation `<OrgSettings/>` draws between the actions
           somebody came for and the one they did not. */
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExtending(true)}
                    className="rounded-full px-4"
                >
                    <Icon size="sm">add</Icon>
                    Add dates
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleStatus}
                    disabled={saving}
                    className="rounded-full px-4"
                >
                    {closed ? "Reopen" : "Close to sign-ups"}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming(true)}
                    /* Held apart from the two constructive actions only where the row has the
                       width for it. On a phone the buttons wrap, and `ml-auto` there strands it
                       alone on a right-aligned line of its own. */
                    className="rounded-full px-4 text-destructive hover:text-destructive sm:ml-auto"
                >
                    Remove sheet
                </Button>
            </div>

            <CalendarMatch row={row} />

            <SignupEditor
                open={extending}
                mode="extend"
                title={row.title}
                onOpenChange={setExtending}
                onSubmit={async (input) => Boolean(await extend(input))}
                saving={saving}
            />

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={`Remove ${row.title}?`}
                description="The sheet and its dates come off this group. Closing it instead keeps the record of who volunteered."
                confirmLabel="Remove"
                onConfirm={destroy}
            />
        </div>
    )
}

/* One rota, as a page: what it is, and every date on it.
 *
 * **A real route** — `/events/s/:sheetId` — and at the same time a level *inside* the Events
 * surface rather than a page of its own. A rota is something a priest links to ("sign up for
 * coffee hour"), something a reminder points at, and something worth having a back button for;
 * all three want a URL. What they do not want is a different screen: `<EventsView/>` serves that
 * path as well as `/events`, so the header and the tab bar stay put and only this panel changes.
 *
 * It owns the sign-up surface too, because the only way to reach a date is through this page:
 * a slot tapped here opens `<SignupClaim/>` over it, and there is nothing above this that needs
 * to know a date was tapped.
 *
 * On a phone Android's own back gesture does what the arrow does — without `useBackHandler` it
 * would leave the app from a screen the reader thinks they are one level into. */
export const RotaPage = ({ row, editing, onBack }) => {
    const [taking, setTaking] = useState(null)
    const onTake = useCallback((slot, title) => setTaking({ slot, title }), [])

    useBackHandler(true, onBack)

    return (
        <div className="flex flex-col gap-6">
            <header className="flex items-center gap-2">
                <Button className="-ml-2.5" variant="ghost" size="icon" onClick={onBack} aria-label="All sign-ups">
                    <Icon size="lg">arrow_back</Icon>
                </Button>

                <h2 className="flex-1 truncate text-lg font-semibold text-foreground">
                    {row.title}
                </h2>

                {row.status !== SIGNUP_STATUS.OPEN && (
                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xxs font-medium text-muted-foreground">
                        Closed
                    </span>
                )}
            </header>

            {row.description && (
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                    {row.description}
                </p>
            )}

            {editing && <SheetActions row={row} />}

            {row.slots.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                    No dates on this sheet yet.
                </p>
            ) : (
                /* Rules rather than boxes. A rota is a list of dates in order, and a column of
                   bordered cards makes each one look like a thing that could be moved about;
                   a divided list reads as one rota with dates in it. */
                <ul className="flex flex-col divide-y">
                    {row.slots.map((slot) =>
                        editing ? (
                            <ManageSlot key={slot.id} slot={slot} />
                        ) : (
                            <SlotRow
                                key={slot.id}
                                slot={slot}
                                sheet={row}
                                onTake={(target) => onTake(target, row.title)}
                            />
                        ),
                    )}
                </ul>
            )}

            <SignupClaim
                slot={taking?.slot ?? null}
                title={taking?.title ?? ""}
                onOpenChange={(next) => {
                    if (!next) setTaking(null)
                }}
            />
        </div>
    )
}

/* One rota in the list: what it is, how much of it still needs people, and an arrow. */
/* **The row's height is split between the `li` and the button inside it.** The button is the
 * whole tap target and the whole hover plate, so a plate that ran the full height would touch
 * the rules above and below it and read as the divider having thickened rather than as a row
 * lighting up. Two of the seven units of padding move to the `li`, which is outside the hover,
 * so the plate sits inset while the text stays exactly where it was. */
const RotaRow = ({ row, onOpen }) => (
    <li className="py-2">
        <button
            type="button"
            onClick={() => onOpen(row.id)}
            className="flex w-full cursor-pointer items-center gap-4 rounded-2xl px-3 py-5 text-left transition-colors hover:bg-accent"
        >
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                    <span className="truncate text-base font-semibold text-foreground">
                        {row.title}
                    </span>
                    {row.status !== SIGNUP_STATUS.OPEN && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xxs font-medium text-muted-foreground">
                            Closed
                        </span>
                    )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                    {row.dates === 0
                        ? row.finished
                            ? "Finished"
                            : "No dates yet"
                        : row.needed === 0
                            ? `${row.dates} ${row.dates === 1 ? "date" : "dates"}, all covered`
                            : `${row.needed} of ${row.dates} ${row.dates === 1 ? "date needs" : "dates need"} people`}
                    {row.nextAt ? ` · next ${formatDayHeading(row.nextAt)}` : ""}
                </span>
            </span>

            {row.mine > 0 && (
                <span className="shrink-0 rounded-full bg-brand/15 px-2.5 py-1 text-xxs font-semibold text-foreground">
                    You: {row.mine}
                </span>
            )}

            <Icon size="xl" className="shrink-0 text-muted-foreground">
                chevron_right
            </Icon>
        </button>
    </li>
)

const SignupSheets = () => {
    const { sheets, skeleton, hasMore, loadingMore, loadMore } = useSignups()
    const { editing, canEdit } = useEventsView()
    const { create, saving } = useSignupAdmin()
    const { sheet, skeleton: loadingRota, open, close } = useSheet()
    const { orgId } = useCurrentOrg()
    const [creating, setCreating] = useState(false)
    const pathname = usePathname()
    const router = useRouter()

    /* **Which rota is open is the URL, not state.** That is what makes a link, a reminder and a
     * cold load all land on the same thing, and it is why this reads the pathname rather than
     * taking an id: nothing above has to know a rota is showing. */
    const routeSheetId = signupIdFor(pathname)

    /* A rota is a route, so opening one is a navigation rather than a state change.
     * `pushRoute` is the shallow-history primitive every runtime route is reached by;
     * `router.push` has no segment to resolve for one in the static export. */
    const openRota = useCallback((sheetId) => pushRoute(signupPath(sheetId)), [])

    /* …and closing one is a navigation back to the list. A real `router.push` rather than
     * `history.back()`, because a cold-loaded link has no entry to unwind and would leave the
     * app — the same fallback `<BackHeader/>` makes when it is given a path. */
    const closeRota = useCallback(
        () => router.push(ROUTES.EVENTS, { scroll: false }),
        [router],
    )

    /* Edit mode wants the rota's whole history — an admin is editing a record rather than
     * signing up for a future — where reading it wants the forward window. */
    useEffect(() => {
        if (routeSheetId) open(routeSheetId, { all: editing })
        else close()
    }, [routeSheetId, editing, open, close])

    /* The rota to draw. The store's copy is the fresher of the two once its refresh lands; the
     * list's is what makes the page paint on the frame the tap happened, with no spinner —
     * every rota in the list arrived with its dates. */
    const rota = routeSheetId
        ? (sheet?.id === routeSheetId
            ? sheet
            : sheets.find((row) => row.id === routeSheetId) ?? null)
        : null

    /* **A rota belonging to a group the reader has since left.** Switching parishes while one
     * is open leaves the URL naming the old one, and the store still holding it — so without
     * this the surface would go on showing another group's rota under the new group's name, and
     * every control on it would write to the wrong parish. That is the org store's own rule:
     * anything scoped is emptied on a switch rather than merely refetched.
     *
     * Derived rather than left to the effect below, so not one frame of it is rendered; the
     * effect is what takes the URL back with it. */
    const foreign = Boolean(rota) && Boolean(orgId) && rota.orgId !== orgId

    /* Switching groups takes the reader out of a rota that belonged to the old one. The URL has
     * to go too — leaving it in place would mean a back button, a refresh or a share pointing at
     * another parish's rota from inside this one. */
    useEffect(() => {
        if (foreign) closeRota()
    }, [foreign, closeRota])

    /* **Not-found is only true once both reads have answered.** The list holds every rota with
     * its dates, so it usually supplies this one — but on a cold link there is neither a list
     * nor a loaded sheet for a moment, and treating that gap as "nothing there" would flash
     * "Sign-up sheet not found" at somebody who followed a perfectly good link. */
    const waiting =
        Boolean(routeSheetId) && (foreign || (!rota && (skeleton || loadingRota)))

    const publish = useCallback(
        async (input) => {
            const created = await create(input)
            if (created) {
                toast.success(`${created.title} published.`)
                /* Straight onto the rota that was just made: the next thing an admin does is
                 * look at its dates, and leaving them on the list means finding it again. */
                pushRoute(signupPath(created.id))
            }
            return Boolean(created)
        },
        [create],
    )

    return (
        <div className="flex flex-col gap-6">
            <AnimatePresence mode="wait" initial={false}>
                {waiting ? (
                    /* The rota's own shape, not the list's — see `<RotaSkeleton/>`. */
                    <Transition fast key="rota-skeleton">
                        <RotaSkeleton />
                    </Transition>
                ) : routeSheetId ? (
                    rota ? (
                        <Transition fast key={`rota-${rota.id}`}>
                            <RotaPage row={rota} editing={editing} onBack={closeRota} />
                        </Transition>
                    ) : (
                        <Transition fast key="missing">
                            {/* Loaded, and there is nothing there — a retired rota, or a link
                                to a group this person is not in, which the API answers as a 404
                                for the reason `requireMembership` does. One wording for both,
                                because telling them apart would be telling them which groups
                                exist. */}
                            <div className="flex flex-col items-center gap-3 py-20 text-center">
                                <Icon size="xl" className="text-muted-foreground/60">
                                    event_busy
                                </Icon>
                                <p className="text-sm font-medium text-foreground">
                                    Sign-up sheet not found
                                </p>
                                <Button variant="outline" onClick={closeRota} className="px-6">
                                    All sign-ups
                                </Button>
                            </div>
                        </Transition>
                    )
                ) : skeleton ? (
                    <Transition fast key="skeleton">
                        <SignupsSkeleton />
                    </Transition>
                ) : (
                    <Transition fast key="list">
                        <div className="flex flex-col gap-6">
                            {sheets.length === 0 && !editing ? (
                                <div className="flex flex-col items-center gap-2 py-16 text-center">
                                    <Icon size="xl" className="text-muted-foreground/60">
                                        event_available
                                    </Icon>
                                    <p className="text-sm font-medium text-foreground">
                                        No sign-up sheets yet
                                    </p>
                                    <p className="max-w-xs text-sm text-muted-foreground">
                                        {canEdit
                                            ? "Publish one for coffee hour, the soup kitchen, or a weekend that needs shifts."
                                            : "When the parish needs hands for something, it will show up here."}
                                    </p>
                                </div>
                            ) : (
                                <ul className="flex flex-col divide-y -mt-6">
                                    {sheets.map((row) => (
                                        <RotaRow key={row.id} row={row} onOpen={openRota} />
                                    ))}

                                    {/* **A row, not a button floating above the list.** Making
                                        a new rota is the last thing in the list of rotas, in
                                        the same rhythm as the ones already there — the same
                                        call the group switcher's New group row makes, and for
                                        the same reason: this list is already the answer to
                                        "what rotas are there", so "and make another" belongs at
                                        the foot of that answer. */}
                                    {editing && (
                                        <li className="py-2">
                                            <button
                                                type="button"
                                                onClick={() => setCreating(true)}
                                                className="flex w-full cursor-pointer items-center gap-4 rounded-2xl px-3 py-5 text-left transition-colors hover:bg-accent"
                                            >
                                                <span className="flex flex-1 items-center gap-2 text-base font-semibold text-foreground">
                                                    <Icon size="md">add</Icon>
                                                    New sign-up sheet
                                                </span>
                                            </button>
                                        </li>
                                    )}
                                </ul>
                            )}

                            {hasMore && (
                                <Button
                                    variant="ghost"
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="mx-auto"
                                >
                                    {loadingMore ? (
                                        <Ripple
                                            aria-label="Loading more sheets"
                                            className="size-6 [&_circle]:stroke-current"
                                        />
                                    ) : (
                                        "Show more"
                                    )}
                                </Button>
                            )}
                        </div>
                    </Transition>
                )}
            </AnimatePresence>

            <SignupEditor
                open={creating}
                mode="create"
                onOpenChange={setCreating}
                onSubmit={publish}
                saving={saving}
            />
        </div>
    )
}

export default SignupSheets
