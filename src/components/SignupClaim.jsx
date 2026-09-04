"use client"

import { useCallback, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import Ripple from "@/assets/svg/ripple.svg"
import Icon from "@/components/Icon"
import PushOffer from "@/components/PushOffer"
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
import { Switch } from "@/components/ui/switch"
import { MAX_CLAIM_NOTE_LENGTH, MAX_ON_BEHALF_OF_LENGTH } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useNow } from "@/lib/hooks/useNow.hook"
import { usePushPermission } from "@/lib/store/push/hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { useSheet } from "@/lib/store/sheet/hook"
import { cn, formatDayHeading, formatTimeRange } from "@/lib/utils"

/* Taking a place on a rota — a dialog on a desktop, a bottom sheet on a phone.
 *
 * ── Why signing up asks anything at all ──────────────────────────────────────
 *
 * A one-tap Take would be less friction, and it was the first shape. It loses the two things
 * that make this a parish rota rather than a booking form:
 *
 *   **On behalf of.** A body signs up as often as a person does — the Fellowship takes coffee
 *   hour and sends whoever it sends — and the calendar should read "OCF" where it would
 *   otherwise read one student's name. Somebody still has to be answerable, which is why this
 *   is a field on a claim rather than a different kind of claim.
 *
 *   **Remind me.** The whole point of signing up three weeks out is that you will not be
 *   thinking about it in three weeks. Defaulted on, because that is what somebody signing up
 *   means, and offered rather than assumed because a parish has people who keep a paper diary
 *   and do not want their phone buzzing about it.
 *
 * Both are optional and the dialog opens with the toggle already on, so the fast path is
 * Take → Sign up: two taps, and neither of them a decision.
 *
 * ── It is also how a place is given up ───────────────────────────────────────
 *
 * Opened on a date the viewer already has, it shows the date and one button that releases it.
 * One surface for both, because it is opened by the same gesture from both places that offer
 * it — a Take on the sign-ups tab, and a tap on a block in the day's timeline, where there is
 * no room for two different buttons and no way to know in advance which one a date wants.
 *
 * The structure is `<OrgCreator/>`'s, deliberately — dialog above `md`, Vaul drawer below,
 * `repositionInputs={false}` because Vaul's mobile-Safari scroll lock hand-focuses inputs and
 * that focus does not take inside the Capacitor WebView. Read that component's header before
 * changing any of it.
 */

const schema = z.object({
    onBehalfOf: z
        .string()
        .trim()
        .max(MAX_ON_BEHALF_OF_LENGTH, `Keep this under ${MAX_ON_BEHALF_OF_LENGTH} characters.`),
    note: z
        .string()
        .trim()
        .max(MAX_CLAIM_NOTE_LENGTH, `Keep the note under ${MAX_CLAIM_NOTE_LENGTH} characters.`),
})

const ClaimForm = ({ slot, onDone }) => {
    const { claim, working } = useSheet()
    const { turnOn, permission } = usePushPermission()
    const [remind, setRemind] = useState(true)

    /* **Asking to be reminded is asking for a notification, so it asks for one.**
     *
     * A reminder that the device will never deliver is the failure this closes: the row still
     * lands in the panel, but somebody who turned this on expects their phone to buzz, and
     * finding out on the morning of the shift that it did not is the whole thing gone wrong.
     * So flipping it on runs the same procedure the account settings' button runs — prompt
     * where a prompt is still possible, otherwise the OS's own settings — through the one hook
     * that owns that three-state rule.
     *
     * Only on the way *on*, and only when it is not already granted: a switch turned off is not
     * a request for anything, and a device that already has permission has nothing to ask. */
    const onRemind = useCallback(
        (next) => {
            setRemind(next)
            if (next && permission !== "granted") turnOn()
        },
        [permission, turnOn],
    )

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: { onBehalfOf: "", note: "" },
    })

    const note = useWatch({ control: form.control, name: "note" }) ?? ""
    const saving = Boolean(working[slot.id])

    /* A slot that has already been and gone cannot be signed up for, and the server refuses
     * it — so the toggle is not offered for one, rather than being offered and then failing.
     * Reminders in the past are dropped server-side too; this is the visible half.
     *
     * `useNow` rather than `Date.now()`: reading the clock during render is impure, which the
     * React compiler rejects outright. The hook's minute tick is also the right granularity
     * here — a dialog left open across the moment a shift begins should stop offering to
     * remind anybody about it. */
    const inFuture = new Date(slot.startsAt).getTime() > useNow()

    const submit = form.handleSubmit(
        async (values) => {
            const result = await claim(slot.id, {
                onBehalfOf: values.onBehalfOf.trim(),
                note: values.note.trim(),
                remind: remind && inFuture,
            })
            if (result) {
                toast.success("You are signed up.")
                onDone()
            }
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
                    <FormField
                        control={form.control}
                        name="onBehalfOf"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>On behalf of</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="OCF - Orthodox Christian Fellowship"
                                        autoComplete="off"
                                        {...field}
                                    />
                                </FormControl>
                                <FormDescription>
                                    Optional. Leave it blank to sign up as yourself.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="note"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Note</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="Bringing the coffee and cups"
                                        autoComplete="off"
                                        {...field}
                                    />
                                </FormControl>
                                <FormDescription>
                                    {note.length > MAX_CLAIM_NOTE_LENGTH - 30
                                        ? `${MAX_CLAIM_NOTE_LENGTH - note.length} characters left`
                                        : "Optional. What you are bringing, or anything else."}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {inFuture && (
                        <div className="flex flex-col gap-3">
                            {/* The description sits beside the label rather than inside it,
                                for the reason the editor's switch row carries: a `<label>` here
                                is deliberately a plain one, but the shape has to match the
                                `<FormLabel/>` rows above it or the column reads as two systems. */}
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex flex-col gap-1">
                                    <label
                                        htmlFor="remind"
                                        className="cursor-pointer pl-2 text-xs font-semibold leading-none text-foreground"
                                    >
                                        Remind me
                                    </label>
                                    <span className="pl-2 text-xs text-muted-foreground">
                                        A week before, and again the day before.
                                    </span>
                                </div>
                                <Switch
                                    id="remind"
                                    checked={remind}
                                    onCheckedChange={onRemind}
                                    className="shrink-0"
                                />
                            </div>

                            {/* Shown only once the reader has asked to be reminded and the
                                device still cannot deliver — which after `onRemind` means the
                                prompt was refused, or was spent on a previous install. It says
                                what is still true rather than what failed: the reminder exists
                                either way, in the app. */}
                            {remind && (
                                <PushOffer
                                    size="sm"
                                    description="Notifications are off for this device, so this reminder will only appear in the app."
                                    className="rounded-2xl bg-muted/40 p-3"
                                />
                            )}
                        </div>
                    )}
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
                                aria-label="Signing up"
                                className="size-8 [&_circle]:stroke-current"
                            />
                        ) : (
                            "Sign up"
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    )
}

/* The date the viewer already has: what they promised, and the one way out of it.
 *
 * A plain surface rather than a form, because giving up a place asks nothing — and it is not
 * behind a confirmation dialog either, since it is already two deliberate taps in and is
 * trivially undone by signing up again. */
const ReleaseBody = ({ slot, onDone }) => {
    const { release, working } = useSheet()
    const busy = Boolean(working[slot.id])

    const giveUp = async () => {
        const result = await release(slot.mine, slot.id)
        if (result) {
            toast.success("You are off that date.")
            onDone()
        }
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-6 pb-6 text-center">
                <Icon size="xl" className="mx-auto text-brand">event_available</Icon>
                <p className="text-base font-semibold text-foreground">
                    You are signed up
                </p>
                <p className="text-sm text-muted-foreground">
                    {slot.capacity > 1
                        ? `${slot.taken} of ${slot.capacity} taken.`
                        : "Thank you."}
                </p>
            </div>

            <div className="shrink-0 border-t px-4 py-3 sm:flex sm:justify-end">
                <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={busy}
                    onClick={giveUp}
                    className="w-full sm:w-fit sm:px-10"
                >
                    {busy ? (
                        <Ripple
                            aria-label="Giving up your place"
                            className="size-8 [&_circle]:stroke-current"
                        />
                    ) : (
                        "Give up my place"
                    )}
                </Button>
            </div>
        </div>
    )
}

/* A date nobody can take: cancelled, closed to sign-ups, gone by, or full.
 *
 * Shown rather than the surface simply refusing to open, because the reader tapped something
 * and is owed an answer about it — and because on the day's timeline the block is the only
 * thing that could have told them. */
const ClosedBody = ({ reason }) => (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-16 text-center">
        <Icon size="xl" className="text-muted-foreground/60">event_busy</Icon>
        <p className="text-sm text-muted-foreground">{reason}</p>
    </div>
)

/* Mounted with whichever slot was tapped, and unmounted on close — so the form is seeded fresh
 * each time rather than kept alive behind a closed sheet holding the last rota's details. */
const SignupClaim = ({ slot, title, onOpenChange }) => {
    const isDesktop = useIsDesktop()
    const now = useNow()
    const open = Boolean(slot)

    useBackHandler(open, () => onOpenChange(false))

    const when = slot
        ? `${formatDayHeading(slot.startsAt)}, ${formatTimeRange(slot.startsAt, slot.endsAt)}`
        : ""

    /* Which of the three bodies this date wants. Ordered the way a person would ask: am I on
     * it, is it happening, is there room. */
    const body = !slot ? null
        : slot.mine ? <ReleaseBody slot={slot} onDone={() => onOpenChange(false)} />
        : slot.canceled ? <ClosedBody reason="This date has been cancelled." />
        : slot.open === false ? <ClosedBody reason="This sign-up sheet is closed." />
        : new Date(slot.endsAt).getTime() < now ? <ClosedBody reason="This date has already been." />
        : slot.spotsLeft === 0 ? <ClosedBody reason="This date is full. Try another one." />
        : <ClaimForm slot={slot} onDone={() => onOpenChange(false)} />

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-lg">
                    <DialogHeader className="border-b px-4 pb-4 pt-5">
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>{when}</DialogDescription>
                    </DialogHeader>
                    {body}
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
            {/* Sized to what it holds rather than to a fixed share of the screen: giving up a
                place is three lines and a button, and a sheet nine tenths of the way up the
                display for that reads as a mistake. */}
            <DrawerContent className={cn("max-h-[90dvh]", slot?.mine ? "" : "h-[90dvh]")}>
                <KeyboardAwareColumn>
                    <DrawerHeader className="shrink-0 border-b pt-2 pb-4">
                        <DrawerTitle className="text-center font-semibold">{title}</DrawerTitle>
                        <p className="text-center text-xs text-muted-foreground">{when}</p>
                    </DrawerHeader>
                    {body}
                </KeyboardAwareColumn>
            </DrawerContent>
        </Drawer>
    )
}

export default SignupClaim
