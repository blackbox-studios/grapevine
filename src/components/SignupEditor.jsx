"use client"

import { useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import Ripple from "@/assets/svg/ripple.svg"
import DatePicker from "@/components/DatePicker"
import { KeyboardAwareColumn } from "@/components/KeyboardAware"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
    MAX_SIGNUP_DESCRIPTION_LENGTH,
    MAX_SIGNUP_TITLE_LENGTH,
    MAX_SLOT_CAPACITY,
    SIGNUP_PATTERNS,
} from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useNow } from "@/lib/hooks/useNow.hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { cn, todayLocal, WEEKDAY_NAMES } from "@/lib/utils"

/* Publishing a rota, and extending one — the same form, because they are the same question.
 *
 * ── One schedule builder for three rotas ─────────────────────────────────────
 *
 * The three rotas a parish actually runs look like three features and are one:
 *
 *   coffee hour       every Sunday, 11:00-12:30, one person, ongoing
 *   the soup kitchen  every Saturday, 9:00-12:00, four people, ongoing
 *   festival parking  6-7 June, 16:00-22:00, split into two-hour shifts, four people each
 *
 * What differs is *which days* (a weekday repeated, or a span of dates) and *whether a day is
 * one shift or several*. Everything else — the time window, the number of people — is shared.
 * So the form asks those two questions and nothing more, and the third rota is the first one
 * with two boxes filled in differently rather than a separate mode with its own screen.
 *
 * ── Ongoing is the default, because most rotas are ───────────────────────────
 *
 * A standing rota has no end: the kitchen is every Saturday, and asking a priest for how many
 * weeks is asking him to pick a date on which the parish stops feeding people. So a weekly rota
 * keeps going unless it is told not to, and the count of weeks only appears when it is. A span
 * of dates is the other kind by definition — a festival weekend finishes — so the toggle does
 * not apply to it and is not shown.
 *
 * "Ongoing" is real rather than a large number: the sheet carries `repeats`, and the server
 * tops its dates back up to the horizon every time the rota is read. See `topUpRecurring`.
 *
 * The dates themselves are generated **on the server** (`generateSlots`), which is what makes
 * "every Sunday at 11" survive a daylight-saving boundary — see that function's header. This
 * form sends the description of the schedule, never the dates.
 *
 * ── Extending is the same form with the sheet's half removed ─────────────────
 *
 * `mode="extend"` drops the title and description (the sheet already has them) and keeps the
 * schedule. Asking twice is harmless, which is `addSlots`'s property rather than this form's.
 */

const schema = z.object({
    title: z.string().trim().max(MAX_SIGNUP_TITLE_LENGTH, "That name is too long."),
    description: z
        .string()
        .trim()
        .max(MAX_SIGNUP_DESCRIPTION_LENGTH, "That description is too long."),
    capacity: z.coerce
        .number()
        .int()
        .min(1, "At least one person.")
        .max(MAX_SLOT_CAPACITY, `At most ${MAX_SLOT_CAPACITY} people.`),
    pattern: z.enum([SIGNUP_PATTERNS.WEEKLY, SIGNUP_PATTERNS.DATES]),
    weekday: z.coerce.number().int().min(0).max(6),
    weeks: z.coerce.number().int().min(1, "At least one week.").max(52, "At most a year."),
    repeats: z.boolean(),
    startDate: z.string().min(1, "Pick a start date."),
    endDate: z.string(),
    startTime: z.string().min(1, "Pick a start time."),
    endTime: z.string().min(1, "Pick an end time."),
    splitMinutes: z.string(),
})

/* How a day's window is cut up. "None" is the common case by a wide margin — one coffee hour,
 * one soup kitchen — so it leads, and the shift lengths after it are the ones a parish rosters
 * a car park in. */
const SPLITS = [
    { value: "0", label: "One shift" },
    { value: "60", label: "1 hour shifts" },
    { value: "90", label: "90 minute shifts" },
    { value: "120", label: "2 hour shifts" },
    { value: "180", label: "3 hour shifts" },
]

/* Minutes between two "HH:MM" readings, treating an end at or before the start as the next
 * morning — which is what "8 PM to 1 AM" means to whoever typed it. */
const spanMinutes = (start, end) => {
    const read = (value) => {
        const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "")
        return match ? Number(match[1]) * 60 + Number(match[2]) : null
    }
    const from = read(start)
    const to = read(end)
    if (from === null || to === null) return 0
    return to > from ? to - from : to + 24 * 60 - from
}

const EditorForm = ({ mode, onSubmit, saving, onClose }) => {
    const creating = mode === "create"
    const now = useNow()
    const maxYear = useMemo(() => new Date(now).getFullYear() + 2, [now])

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            title: "",
            description: "",
            capacity: 1,
            pattern: SIGNUP_PATTERNS.WEEKLY,
            /* Sunday, because the rota a parish is most likely to be publishing is the one
             * after Liturgy. */
            weekday: 0,
            weeks: 12,
            /* Ongoing by default: the rota a parish is most likely to be publishing is one
             * that does not stop. */
            repeats: true,
            startDate: todayLocal(),
            endDate: todayLocal(),
            startTime: "11:00",
            endTime: "12:30",
            splitMinutes: "0",
        },
    })

    const pattern = useWatch({ control: form.control, name: "pattern" })
    const repeats = useWatch({ control: form.control, name: "repeats" })
    const ongoing = repeats && pattern === SIGNUP_PATTERNS.WEEKLY
    const startTime = useWatch({ control: form.control, name: "startTime" })
    const endTime = useWatch({ control: form.control, name: "endTime" })
    const split = Number(useWatch({ control: form.control, name: "splitMinutes" }) ?? 0)

    /* How many shifts one day produces. Shown rather than the grand total: the number of days
     * is something the person just typed, and the number of shifts is the part the split box
     * quietly decided for them. */
    const shifts = useMemo(() => {
        const span = spanMinutes(startTime, endTime)
        if (!span || !split) return 1
        return Math.ceil(span / split)
    }, [startTime, endTime, split])

    const submit = form.handleSubmit(
        async (values) => {
            const ok = await onSubmit({
                ...(creating
                    ? {
                          title: values.title.trim().replace(/\s+/g, " "),
                          description: values.description.trim(),
                      }
                    : {}),
                capacity: values.capacity,
                schedule: {
                    pattern: values.pattern,
                    weekday: values.weekday,
                    weeks: values.weeks,
                    /* Only meaningful weekly — a span of dates ends by definition. The server
                     * checks the same thing rather than trusting it. */
                    repeats: values.repeats && values.pattern === SIGNUP_PATTERNS.WEEKLY,
                    startDate: values.startDate,
                    endDate: values.endDate,
                    startTime: values.startTime,
                    endTime: values.endTime,
                    splitMinutes: values.splitMinutes === "0" ? null : Number(values.splitMinutes),
                    /* The parish's clock, taken from the device of the person publishing the
                     * rota — who is, by construction, standing in the parish. The server needs
                     * it to keep "every Sunday at 11" at eleven across a daylight-saving
                     * change; see `SignupSheet.timezone`. */
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
            })
            if (ok) onClose()
        },
        (errors) => {
            const first = Object.values(errors).find((error) => error?.message)?.message
            if (first) toast.error(first)
        },
    )

    return (
        <Form {...form}>
            <form onSubmit={submit} data-vaul-no-drag className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
                    {creating && (
                        <>
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Name</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="Coffee hour"
                                                autoComplete="off"
                                                autoFocus
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Instructions</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Bring something for after Liturgy. Nothing that needs cooking on site."
                                                rows={3}
                                                className="min-h-19 resize-none"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Optional. Shown at the top of the sheet.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </>
                    )}

                    {/* Which days. A segmented pair rather than a select: there are two, and a
                        select would hide half the answer behind a tap. */}
                    <FormField
                        control={form.control}
                        name="pattern"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Repeats</FormLabel>
                                <div className="flex gap-2">
                                    {[
                                        { value: SIGNUP_PATTERNS.WEEKLY, label: "Every week" },
                                        { value: SIGNUP_PATTERNS.DATES, label: "Set dates" },
                                    ].map(({ value, label }) => (
                                        <Button
                                            key={value}
                                            type="button"
                                            variant={field.value === value ? "default" : "outline"}
                                            onClick={() => field.onChange(value)}
                                            className={cn(
                                                "flex-1",
                                                field.value !== value && "text-muted-foreground",
                                            )}
                                        >
                                            {label}
                                        </Button>
                                    ))}
                                </div>
                            </FormItem>
                        )}
                    />

                    {pattern === SIGNUP_PATTERNS.WEEKLY ? (
                        <>
                            <div className="flex flex-col gap-6 sm:flex-row">
                                <FormField
                                    control={form.control}
                                    name="weekday"
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            <FormLabel>Day</FormLabel>
                                            <Select
                                                value={String(field.value)}
                                                onValueChange={(value) => field.onChange(Number(value))}
                                            >
                                                <FormControl>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {WEEKDAY_NAMES.map((name, index) => (
                                                        <SelectItem key={name} value={String(index)}>
                                                            {name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />

                                {/* Only once the rota has been told to stop. A standing rota has
                                    no answer to "for how many weeks", and asking anyway is
                                    asking a priest to pick the date the parish stops feeding
                                    people. */}
                                {!ongoing && (
                                    <FormField
                                        control={form.control}
                                        name="weeks"
                                        render={({ field }) => (
                                            /* Labelled "Weeks" rather than "For" with the unit
                                               hung underneath: a description below one of two
                                               side-by-side fields makes the pair ragged, and the
                                               unit belongs in the label of a number box anyway. */
                                            <FormItem className="sm:w-32">
                                                <FormLabel>Weeks</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        max={52}
                                                        inputMode="numeric"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>

                            <FormField
                                control={form.control}
                                name="repeats"
                                render={({ field }) => (
                                    <FormItem>
                                        {/* The description sits *beside* the label rather than
                                            inside it. `<FormLabel/>` is `flex items-center`, so
                                            a column nested in it centres its own children —
                                            which puts a short label adrift over a long
                                            description instead of flush with it. */}
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex flex-col gap-1">
                                                <FormLabel htmlFor="repeats" className="mb-0">
                                                    Keep going
                                                </FormLabel>
                                                <span className="pl-2 text-xs text-muted-foreground">
                                                    New dates appear as the old ones pass. No end.
                                                </span>
                                            </div>
                                            <FormControl>
                                                <Switch
                                                    id="repeats"
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                    className="shrink-0"
                                                />
                                            </FormControl>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        </>
                    ) : null}

                    <div className="flex flex-col gap-6 sm:flex-row">
                        <FormField
                            control={form.control}
                            name="startDate"
                            render={({ field }) => (
                                <FormItem className="flex-1">
                                    <FormLabel>
                                        {pattern === SIGNUP_PATTERNS.WEEKLY ? "Starting" : "From"}
                                    </FormLabel>
                                    <FormControl>
                                        <DatePicker
                                            value={field.value}
                                            onChange={field.onChange}
                                            maxYear={maxYear}
                                            label="Start date"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {pattern === SIGNUP_PATTERNS.DATES && (
                            <FormField
                                control={form.control}
                                name="endDate"
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormLabel>To</FormLabel>
                                        <FormControl>
                                            <DatePicker
                                                value={field.value}
                                                onChange={field.onChange}
                                                maxYear={maxYear}
                                                label="End date"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                    </div>

                    <div className="flex gap-5">
                        <FormField
                            control={form.control}
                            name="startTime"
                            render={({ field }) => (
                                <FormItem className="flex-1">
                                    <FormLabel>From</FormLabel>
                                    <FormControl>
                                        {/* A native time input, unlike the date beside it.
                                            `<DatePicker/>` exists because a birthday is chosen
                                            by scrubbing to a year, which no native control does
                                            well; a time of day is four digits and every
                                            platform's own picker handles it better than a
                                            bespoke drum would. */}
                                        <Input type="time" step={300} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="endTime"
                            render={({ field }) => (
                                <FormItem className="flex-1">
                                    <FormLabel>To</FormLabel>
                                    <FormControl>
                                        <Input type="time" step={300} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="splitMinutes"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Shifts</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {SPLITS.map(({ value, label }) => (
                                            <SelectItem key={value} value={value}>
                                                {label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormDescription>
                                    {shifts === 1
                                        ? "One sign-up covering the whole window."
                                        : `${shifts} shifts a day, each needing its own people.`}
                                </FormDescription>
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="capacity"
                        render={({ field }) => (
                            <FormItem className="sm:w-40">
                                <FormLabel>People needed</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={MAX_SLOT_CAPACITY}
                                        inputMode="numeric"
                                        {...field}
                                    />
                                </FormControl>
                                <FormDescription>per shift</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="shrink-0 border-t px-4 py-3 sm:flex sm:justify-end">
                    <Button
                        type="submit"
                        size="lg"
                        disabled={saving}
                        className="w-full sm:w-fit sm:px-10"
                    >
                        {saving ? (
                            <Ripple
                                aria-label={creating ? "Creating sheet" : "Adding dates"}
                                className="size-8 [&_circle]:stroke-current"
                            />
                        ) : creating ? (
                            "Create sheet"
                        ) : (
                            "Add dates"
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    )
}

/* Dialog above `md`, Vaul drawer below — the split every acting surface in this app makes.
 * See `<OrgCreator/>` for why `repositionInputs` is off and why the body is mounted only while
 * the surface is open. */
const SignupEditor = ({ open, mode = "create", title, onOpenChange, onSubmit, saving }) => {
    const isDesktop = useIsDesktop()

    useBackHandler(open, () => onOpenChange(false))

    const heading = mode === "create" ? "New sign-up sheet" : "Add dates"
    const description =
        mode === "create"
            ? "Coffee hour, the soup kitchen, a weekend of shifts"
            : title

    const body = (
        <EditorForm
            mode={mode}
            onSubmit={onSubmit}
            saving={saving}
            onClose={() => onOpenChange(false)}
        />
    )

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-lg">
                    <DialogHeader className="border-b px-4 pb-4 pt-5">
                        <DialogTitle>{heading}</DialogTitle>
                        <DialogDescription>{description}</DialogDescription>
                    </DialogHeader>
                    {open && body}
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
            <DrawerContent className="h-[92dvh] max-h-[92dvh]">
                <KeyboardAwareColumn>
                    <DrawerHeader className="shrink-0 border-b pt-2 pb-4">
                        <DrawerTitle className="text-center font-semibold">{heading}</DrawerTitle>
                    </DrawerHeader>
                    {open && body}
                </KeyboardAwareColumn>
            </DrawerContent>
        </Drawer>
    )
}

export default SignupEditor
