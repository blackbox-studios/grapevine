"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "motion/react"
import useMeasure from "react-use-measure"
import { z } from "zod"

import Ripple from "@/assets/svg/ripple.svg"
import DatePicker from "@/components/DatePicker"
import GatewayShell, { GatewayButton } from "@/components/GatewayShell"
import Icon from "@/components/Icon"
import Transition from "@/components/Transition"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { HANDLE_MAX, HANDLE_MIN, HANDLE_PATTERN } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { normalizeHandleInput, suggestHandle } from "@/lib/name"
import { useOnboarding } from "@/lib/store/auth/hook"
import { usePushPermission } from "@/lib/store/push/hook"
import { cn } from "@/lib/utils"

/* First-run orientation, in three steps: name, @handle, birthday.
 *
 * **Why this screen exists at all.** Admission provisions a person from an email address
 * and nothing else — an admin adds an address, not a biography — so a profile arrives here
 * with no name and a placeholder handle derived from the local part of that address. These
 * are the facts only the person can supply, and this is the one place they are asked.
 *
 * **Why steps rather than one form.** Three questions on one screen is a form; one question
 * at a time is a conversation, and this is the viewer's first minute in the app. It also
 * lets each question have the surface it deserves — the birthday keeps the full-height
 * picker it had when it was the only question, which a three-field form could not afford.
 * The cost is that "which field failed" becomes "which step to return to"; `STEP_FOR_FIELD`
 * below is what makes a server-side rejection land on the step that caused it.
 *
 * **It is still one submission.** Nothing is written until the last step. Posting per step
 * would make a half-onboarded profile a real database state, and there is no screen that
 * repairs one — the gate would keep sending them back here to re-answer questions they had
 * already answered. See `completeOnboarding`.
 *
 * It wears the same shell as sign-in on purpose: the viewer has just come through that
 * screen, and this should read as the next beat of it rather than a new place. */

/* Three questions, then — on a phone that has never been asked — the notification prompt.
 *
 * **The push step comes *before* the write, not after it, and that is forced rather than
 * chosen.** `GatewayRedirect` sends a viewer out of the gateway the moment they have nowhere
 * left to be there, and completing orientation is exactly what sets `onboardedAt` and makes
 * that true. A step rendered after the submit would be unmounted in the same tick it
 * appeared. So the last step asks, and *it* submits — which also keeps the "nothing is
 * written until the end" rule above intact rather than making the write happen two screens
 * from the end.
 *
 * It is a step and not a dialog for the same reason the other three are steps: this is the
 * viewer's first minute, and one thing at a time reads as a conversation. */
const STEPS = ["name", "handle", "birthday", "notifications"]

/* Which step owns which field, for routing a server-side validation failure back to the
 * question that produced it. The submit happens on the last step, so without this a handle
 * taken in the seconds since the availability check would surface as a toast on the
 * birthday screen with nothing to act on. */
const STEP_FOR_FIELD = {
    firstName: "name",
    lastName: "name",
    handle: "handle",
    birthday: "birthday",
}

/* The wrapper each step fades in through. A column rather than a row so the step's form can
 * claim the full height on mobile (which is what puts its action at the bottom), with
 * `items-center` doing the horizontal centring the row used to — on desktop the form caps
 * itself at `max-w-88`, on mobile it spans the width like the reference layout. */
const STEP_CLASS = "flex min-h-0 w-full flex-1 flex-col items-center"

const nameSchema = z.object({
    /* Bounded, not patterned. Any regex narrow enough to be worth writing rejects
     * somebody's real name — Cyrillic, apostrophes, and hyphens are all ordinary here. */
    firstName: z.string().trim().min(1, "Enter your first name").max(80, "That is too long"),
    lastName: z.string().trim().min(1, "Enter your last name").max(80, "That is too long"),
})

const handleSchema = z.object({
    handle: z
        .string()
        .trim()
        .min(HANDLE_MIN, `At least ${HANDLE_MIN} characters`)
        .max(HANDLE_MAX, `At most ${HANDLE_MAX} characters`)
        .regex(
            HANDLE_PATTERN,
            "Letters, numbers, dots, underscores and hyphens — starting and ending with a letter or number",
        ),
})

/* Validated as a calendar date, not a timestamp. Bounds rather than a bare is-this-a-date
 * check, because the failures worth catching are a typo'd year and a future date, and
 * "1837" or "next Tuesday" both pass an is-this-a-date test. */
const birthdaySchema = z.object({
    birthday: z
        .string()
        .trim()
        .min(1, "Enter your date of birth")
        .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), "Enter your date of birth")
        .refine((value) => {
            const date = new Date(`${value}T00:00:00.000Z`)
            return !Number.isNaN(date.getTime()) && date <= new Date()
        }, "That date is in the future")
        .refine((value) => Number(value.slice(0, 4)) >= 1900, "Check the year"),
})

/* Whether every answer on this step is good enough to move on — what fades the action.
 *
 * Parsed straight from the schema against the watched values rather than read off
 * `formState.isValid`, which only tracks live once the form runs in `onChange` mode — and
 * switching it there would start surfacing red text under a field the moment someone types
 * their first letter. This keeps the two apart: the button reflects validity continuously,
 * while errors still wait until a submit is attempted. */
const useStepValid = (form, schema) => {
    const values = useWatch({ control: form.control })
    return schema.safeParse(values).success
}

/* The shared frame for a step: its own form, the primary action, and an optional way back.
 *
 * Each step mounts its own `useForm`, which is what keeps a half-typed answer on one step
 * from being validated by another's resolver — and what makes the back button cheap, since
 * the values live in the parent and each form is re-seeded from them on mount.
 *
 * **On mobile the form *is* the column, and the button is its last element.** It grows to
 * fill the shell's keyboard-safe height and the action is `mt-auto`, so the button lands
 * exactly on the bottom edge — which is the top of the keyboard. Keeping it inside the form
 * is what makes this simple: no portal, no `form=` attribute wiring it back to a submit
 * handler somewhere else in the tree.
 *
 * Two details are load-bearing, and both were wrong first time round:
 *
 *  - **`flex-1`, not `h-full`.** A percentage height has to chase a definite height up
 *    through every ancestor, and one `flex` wrapper in the middle that never got a height of
 *    its own breaks the chain silently — the form collapses to its content, `mt-auto` has no
 *    free space to consume, and the button parks directly under the fields with a gap
 *    beneath it. Growing as a flex item asks nothing of the ancestors.
 *  - **Nothing renders after the button.** The note and the way back both used to, and each
 *    one pushed the action up by its own height, leaving exactly the gap this layout exists
 *    to close. The note now sits with the field it explains, and going back is the shell's
 *    top-left arrow.
 *
 * Desktop keeps the intrinsic-height stack it had, centred by the hero layout, where a text
 * "Back" under the button is fine because there is no keyboard to crowd it. */
const Step = ({
    form,
    onSubmit,
    onBack,
    submitLabel,
    loading,
    busyLabel,
    children,
    note,
    fill,
    disabled,
}) => (
    <Form {...form}>
        <form
            onSubmit={form.handleSubmit(onSubmit)}
            className={cn(
                "flex w-full flex-col items-center gap-5",
                fill ? "min-h-0 flex-1" : "max-w-88",
            )}
        >
            {children}

            {note}

            <div
                className={cn(
                    "flex w-full flex-col items-center gap-4",
                    /* Pinned to the foot of the column on mobile — nothing below it, so it
                     * sits flush above the keyboard. Just the next thing in the stack on
                     * desktop. */
                    fill && "mt-auto shrink-0 pt-6",
                )}
            >
                <GatewayButton
                    type="submit"
                    disabled={loading || disabled}
                    loading={loading}
                    busyLabel={busyLabel}
                >
                    {submitLabel}
                </GatewayButton>

                {!fill && onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        disabled={loading}
                        className="cursor-pointer text-xs text-muted-foreground underline-offset-4 transition-opacity hover:underline disabled:opacity-50"
                    >
                        Back
                    </button>
                )}
            </div>
        </form>
    </Form>
)

const NameStep = ({ values, onNext, loading, fill }) => {
    const form = useForm({
        resolver: zodResolver(nameSchema),
        defaultValues: { firstName: values.firstName, lastName: values.lastName },
    })

    const valid = useStepValid(form, nameSchema)

    return (
        <Step
            form={form}
            onSubmit={onNext}
            submitLabel="Continue"
            loading={loading}
            busyLabel="Saving your details"
            fill={fill}
            disabled={!valid}
        >
            <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                    <FormItem className="w-full">
                        <FormControl>
                            <Input
                                autoComplete="given-name"
                                autoCapitalize="words"
                                placeholder="First name"
                                aria-label="First name"
                                /* The reader has just arrived from the code screen; the one
                                 * thing they want to do is type. */
                                autoFocus
                                disabled={loading}
                                {...field}
                            />
                        </FormControl>
                        <FormMessage className="px-5" />
                    </FormItem>
                )}
            />

            <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                    <FormItem className="w-full">
                        <FormControl>
                            <Input
                                autoComplete="family-name"
                                autoCapitalize="words"
                                placeholder="Last name"
                                aria-label="Last name"
                                disabled={loading}
                                {...field}
                            />
                        </FormControl>
                        <FormMessage className="px-5" />
                    </FormItem>
                )}
            />
        </Step>
    )
}

/* How long a handle sits unchanged before it is checked. Long enough that typing a
 * fourteen-character handle is one request rather than fourteen, short enough that the
 * answer is there before a reader who paused has reached for the button. */
const HANDLE_CHECK_DELAY_MS = 400

const HandleStep = ({ values, onNext, onBack, checkHandle, loading, fill }) => {
    const form = useForm({
        resolver: zodResolver(handleSchema),
        defaultValues: { handle: values.handle },
    })

    /* `useWatch`, not `form.watch()`. The latter returns a fresh function on every render,
     * which React Compiler cannot memoize and therefore refuses to compile the component
     * around — `useWatch` is the subscription form and re-renders only this field's
     * dependents. */
    const handle = useWatch({ control: form.control, name: "handle" })

    /* Only the *answer* is state, and it carries the handle it is an answer about.
     *
     * "Checking" is then derived rather than stored — it is simply the gap between what the
     * field holds and what the last reply was about — which keeps this effect free of a
     * synchronous setState and the cascading render that comes with one. It also makes a
     * stale reply harmless: a slow check that lands after the reader has typed on no longer
     * matches `handle`, so it renders as nothing instead of reporting "taken" against a
     * value that is no longer on screen. */
    const [answer, setAnswer] = useState(null)

    /* Nothing to ask about until it could plausibly be valid. Checking a two-character
     * fragment mid-typing spends a request to be told what the local schema already knows,
     * and flashes an error at someone who simply has not finished typing. */
    const value = String(handle ?? "").trim()
    const checkable = HANDLE_PATTERN.test(value)

    useEffect(() => {
        if (!checkable) return

        let live = true
        const timer = setTimeout(async () => {
            const result = await checkHandle(value)
            if (live) setAnswer(result)
        }, HANDLE_CHECK_DELAY_MS)

        return () => {
            live = false
            clearTimeout(timer)
        }
    }, [value, checkable, checkHandle])

    const status = !checkable
        ? null
        : answer?.handle === value
          ? { state: answer.available ? "available" : "taken", reason: answer.reason }
          : { state: "checking" }

    const submit = (next) => {
        /* Belt and braces. The button below is disabled unless the handle has come back
         * available, so this should be unreachable — but a form can still be submitted by
         * pressing Enter in the field, and the answer can go stale between the check and the
         * keystroke. Catching it here keeps the failure on this step rather than at the end
         * of the flow. */
        if (status?.state !== "available") {
            form.setError("handle", { message: status?.reason ?? "That handle is taken." })
            return
        }
        onNext(next)
    }

    /* Enabled only once the handle is well-formed **and confirmed free** — so a check still
     * in flight leaves the button faded rather than letting someone through to be bounced
     * back by the server.
     *
     * The cost is that the button dims for the debounce plus a round trip after each
     * keystroke, which on its own would read as flickering. The spinner in the field is what
     * makes that legible: the pause is visibly the app checking, not the button misbehaving.
     *
     * A failed check resolves as available (see `checkHandle` in the auth store), so a
     * network blip cannot strand anyone on a permanently disabled button. */
    const valid = useStepValid(form, handleSchema) && status?.state === "available"

    return (
        <Step
            form={form}
            onSubmit={submit}
            onBack={onBack}
            submitLabel="Continue"
            loading={loading}
            busyLabel="Saving your details"
            fill={fill}
            disabled={!valid}
            /* Sits with the field it describes rather than down by the button. The
             * subheading already says what a handle is *for*; this is the mechanical rule,
             * and it is only useful while you are looking at the input. */
            note={
                <p className="w-full text-xs leading-relaxed text-muted-foreground">
                    Letters, numbers, dots, underscores and hyphens.
                </p>
            }
        >
            <FormField
                control={form.control}
                name="handle"
                render={({ field }) => (
                    <FormItem className="w-full">
                        <FormControl>
                            <div className="relative">
                                {/* The @ is chrome, not content — it sits in the field so
                                  * the handle reads the way it will appear on a comment,
                                  * without ever becoming part of the value. Typing one is
                                  * still tolerated; `normalizeHandleInput` strips it. */}
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                    @
                                </span>
                                <Input
                                    autoComplete="off"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    placeholder="handle"
                                    aria-label="Your handle"
                                    autoFocus
                                    disabled={loading}
                                    className="pl-7 pr-10"
                                    {...field}
                                    /* Normalized as they type rather than at submit, so the
                                     * field always shows the value that will be saved
                                     * instead of silently changing it afterwards. */
                                    onChange={(event) =>
                                        field.onChange(normalizeHandleInput(event.target.value))
                                    }
                                />
                                {/* Three states, and the spinner is the one that earns its
                                  * keep: while it turns, the action below is deliberately
                                  * disabled, and without it that pause reads as a dead
                                  * button rather than as the app checking. */}
                                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                                    {status?.state === "checking" && (
                                        <Ripple
                                            aria-label="Checking that handle"
                                            className="size-5 text-muted-foreground [&_circle]:stroke-current"
                                        />
                                    )}
                                    {status?.state === "available" && (
                                        <Icon size="sm" className="text-success">
                                            check_circle
                                        </Icon>
                                    )}
                                    {status?.state === "taken" && (
                                        <Icon size="sm" className="text-destructive">
                                            cancel
                                        </Icon>
                                    )}
                                </span>
                            </div>
                        </FormControl>
                        {/* The availability answer and the format error share one line, and
                          * the format error wins — a handle that is not a handle cannot be
                          * meaningfully "taken". */}
                        {status?.state === "taken" && !form.formState.errors.handle ? (
                            <p className="px-5 text-sm text-destructive">
                                {status.reason ?? "That handle is already taken."}
                            </p>
                        ) : (
                            <FormMessage className="px-5" />
                        )}
                    </FormItem>
                )}
            />
        </Step>
    )
}

/* The push priming step, and the reason the app does not simply call `enable()` on sign-in.
 *
 * **iOS shows its system prompt once per install and a refusal is permanent** — the only way
 * back is the person finding Grapevine in Settings, which nobody does. So the OS prompt is
 * far too expensive to spend on somebody who has not yet seen a notification worth having.
 * This screen is the cheap ask: a "Not now" here costs nothing and can be offered again from
 * Settings, and the real prompt is only ever reached by someone who has already said yes.
 *
 * **Deliberately not built on `<Step/>`.** That wrapper is a `<form>` around fields, and this
 * step has neither — it collects nothing, and there is no schema for "did you tap yes". What
 * it does need is the same bottom-pinned action layout, which is why the container classes
 * below mirror it rather than being invented: on mobile the column fills the keyboard-safe
 * height and the actions are `mt-auto`, so they land flush on the bottom edge.
 *
 * Both buttons complete orientation. Declining is a decision about notifications, not about
 * joining the parish, and stranding someone on this screen for saying no would be absurd. */
const NotificationsStep = ({ onDone, onBack, loading, fill }) => {
    const [asking, setAsking] = useState(false)
    const busy = loading || asking

    const turnOn = async () => {
        setAsking(true)
        /* The result is deliberately ignored. Whether the OS said yes or no, the next thing
         * that happens is the same — orientation completes and they land in the parish. The
         * answer is already recorded in the push store, and Settings reads it from there. */
        try {
            await onDone({ enable: true })
        } finally {
            setAsking(false)
        }
    }

    return (
        <div
            className={cn(
                "flex w-full flex-col items-center gap-5",
                fill ? "min-h-0 flex-1" : "max-w-88",
            )}
        >
            <Icon size="xl" className="text-(--mark-accent)" aria-hidden>
                notifications
            </Icon>

            <div className={cn("flex w-full flex-col items-center gap-4", fill && "mt-auto shrink-0 pt-6")}>
                <GatewayButton
                    type="button"
                    onClick={turnOn}
                    disabled={busy}
                    loading={busy}
                    busyLabel="Just a moment"
                >
                    Turn on notifications
                </GatewayButton>

                <button
                    type="button"
                    onClick={() => onDone({ enable: false })}
                    disabled={busy}
                    className="cursor-pointer text-xs text-muted-foreground underline-offset-4 transition-opacity hover:underline disabled:opacity-50"
                >
                    Not now
                </button>

                {!fill && onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        disabled={busy}
                        className="cursor-pointer text-xs text-muted-foreground underline-offset-4 transition-opacity hover:underline disabled:opacity-50"
                    >
                        Back
                    </button>
                )}
            </div>
        </div>
    )
}

const BirthdayStep = ({ values, onNext, onBack, loading, fill, submitLabel }) => {
    const form = useForm({
        resolver: zodResolver(birthdaySchema),
        defaultValues: { birthday: values.birthday },
    })

    /* Both surfaces stop at this year, so the picker agrees with the validation rather than
     * offering dates it will then reject. */
    const thisYear = useMemo(() => new Date().getFullYear(), [])

    const valid = useStepValid(form, birthdaySchema)

    return (
        <Step
            form={form}
            onSubmit={onNext}
            onBack={onBack}
            submitLabel={submitLabel}
            loading={loading}
            busyLabel="Saving your details"
            fill={fill}
            disabled={!valid}
        >
            <FormField
                control={form.control}
                name="birthday"
                render={({ field }) => (
                    <FormItem className="w-full">
                        <FormControl>
                            {/* Inline: this step asks one question, so the surface is the
                              * screen rather than something behind a button. Which surface
                              * it is follows the pointer — the drum on a phone, a calendar
                              * on a desktop. */}
                            <DatePicker
                                variant="inline"
                                value={field.value}
                                onChange={field.onChange}
                                maxYear={thisYear}
                                disabled={loading}
                                label="Date of birth"
                            />
                        </FormControl>
                        <FormMessage className="px-5 text-center" />
                    </FormItem>
                )}
            />
        </Step>
    )
}

/* Each step's heading is the question itself.
 *
 * The mobile layout puts the heading at the top and the answer directly beneath it, which
 * only reads well if the heading *is* what is being asked — "Welcome" above a name field
 * makes the reader work out the question from the field. The subheading carries the reason,
 * so nothing has to be repeated as a footnote down by the button. */
const COPY = {
    name: {
        heading: "What's your name?",
        subheading: "Your parish will see this beside everything you post.",
    },
    handle: {
        heading: "Choose a handle",
        subheading: "This is what appears next to your comments.",
    },
    birthday: {
        heading: "When's your birthday?",
        subheading: "Your parish uses it for name days. It is never shown publicly.",
    },
    notifications: {
        heading: "One last thing",
        subheading:
            "Hear about it when your parish posts, or when someone likes something you wrote.",
    },
}

const WelcomePage = () => {
    const { user, submit, checkHandle, loading, clearError } = useOnboarding()

    const [step, setStep] = useState(STEPS[0])
    /* Drives the height animation across a step change. */
    const [measureRef, bounds] = useMeasure()

    /* The answers live here rather than in one big form, so each step can own its own
     * resolver while a Back button still finds the previous answer intact.
     *
     * Seeded from the viewer, which matters for a return visit: someone who reloaded
     * mid-orientation gets their own answers back instead of an empty form. The birthday
     * gets a concrete default rather than "" because the drum always displays *something*
     * — an empty value would mean the screen shows a date the form does not hold, and
     * Continue would submit nothing until the reader happened to scroll a column. Thirty
     * years ago is the drum's own default; this agrees with it, and it gives the desktop
     * calendar a month to open on. */
    const [values, setValues] = useState(() => {
        const now = new Date()
        const defaultBirthday = `${now.getFullYear() - 30}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
        return {
            firstName: user?.firstName ?? "",
            lastName: user?.lastName ?? "",
            /* Deliberately **not** seeded from `user.handle`.
             *
             * Everyone reaching this screen already has one — the provisional handle
             * `deriveHandle` cut from their email address at admission — and offering it
             * here would defeat the step: the field would arrive pre-filled with "j.smith",
             * which reads as a decision already made, and almost nobody edits a filled
             * field. Left empty, the name step's suggestion fills it a moment later with
             * something derived from the name they actually gave. */
            handle: "",
            birthday: user?.birthday ?? defaultBirthday,
        }
    })

    /* Store failures surface as toasts through useErrorListener, so each attempt clears the
     * previous one first — otherwise a stale error sits under a fresh try. */
    const advance = useCallback(
        (next) => {
            clearError()
            setValues((current) => ({ ...current, ...next }))
        },
        [clearError],
    )

    const onName = useCallback(
        (next) => {
            advance(next)
            /* Suggest a handle from the name they just gave, but never overwrite one they
             * have already typed — walking back to change a surname must not silently
             * rewrite a handle they deliberately chose.
             *
             * The vocation comes from the viewer, not from this form: it is the admin's to
             * set at admission and is never asked for here, and it is what decides whether
             * the suggestion is `rdr.justinian` or `robert.paul`. */
            setValues((current) => ({
                ...current,
                handle: current.handle || suggestHandle({ ...next, vocation: user?.vocation }),
            }))
            setStep("handle")
        },
        [advance, user?.vocation],
    )

    const onHandle = useCallback(
        (next) => {
            advance(next)
            setStep("birthday")
        },
        [advance],
    )

    /* Everything is written in one go, by whichever step turns out to be last.
     *
     * On a phone that has never been asked about notifications that is the push step; on the
     * web, or on a device that has already answered, there is nothing left to ask and the
     * birthday step submits directly. `permission === null` is precisely "the OS has never
     * been asked", which is the only state in which prompting shows a prompt — see
     * `pushPermission` in lib/push.js. */
    const {
        supported: pushSupported,
        permission: pushPermission,
        enable: enablePush,
    } = usePushPermission()
    const askPush = pushSupported && pushPermission === null

    const finish = useCallback(
        async (payload) => {
            const result = await submit(payload)
            if (result?.ok) return

            /* Land the reader on the question that failed. The common case is a handle
             * taken between the live check and this write — the toast says what happened,
             * and this is what puts them somewhere they can do something about it. */
            const failed = Object.keys(result?.fields ?? {}).find(
                (field) => STEP_FOR_FIELD[field],
            )
            if (failed) setStep(STEP_FOR_FIELD[failed])
        },
        [submit],
    )

    const onBirthday = useCallback(
        async (next) => {
            clearError()
            const payload = { ...values, ...next }
            setValues(payload)

            if (askPush) {
                setStep("notifications")
                return
            }
            await finish(payload)
        },
        [askPush, clearError, finish, values],
    )

    /* The push step, whichever way it is answered.
     *
     * **The permission is asked for before the profile is written**, and the order matters
     * in exactly one direction: `enable()` registers this device against the viewer, which
     * needs a session — and there is one, since orientation happens signed in. It does not
     * need a *finished* profile. Doing it the other way round is what is impossible: the
     * write sets `onboardedAt`, and `GatewayRedirect` would tear this screen down before the
     * prompt could be answered.
     *
     * A refusal is not an error and is not treated as one. Both answers finish orientation. */
    const onNotifications = useCallback(
        async ({ enable }) => {
            clearError()
            if (enable) await enablePush()
            await finish(values)
        },
        [clearError, enablePush, finish, values],
    )

    const copy = COPY[step]

    /* The two layouts want opposite things from the step container.
     *
     * Mobile fills: the form is a column exactly as tall as the space above the keyboard,
     * which is what pins the action to the bottom of it. Animating that height would fight
     * the keyboard for the same property.
     *
     * Desktop measures: the stack is only as tall as its content, so a step change is a
     * visible jump unless the box animates between the two heights — the birthday picker is
     * far taller than a pair of text fields. */
    const isDesktop = useIsDesktop()

    /* Where "back" goes from each step, or nothing on the first one.
     *
     * Hoisted here because the mobile layout renders it as the shell's top-left arrow —
     * above the heading, out of the action's way — while desktop keeps it as a text link
     * under the button. Both read this one map, so they cannot disagree about where back
     * leads. */
    const back = {
        name: null,
        handle: () => setStep("name"),
        birthday: () => setStep("handle"),
        notifications: () => setStep("birthday"),
    }[step]

    /* Keyed per step, so each form starts with its own clean react-hook-form state instead
     * of inheriting the previous step's — and so AnimatePresence has a change to animate.
     * `mode="wait"` cross-fades them rather than swapping instantly. */
    /* Just the current step's body. **No AnimatePresence on mobile** — the shell cross-fades
     * the whole screen, heading and body together, because animating only the body left the
     * heading to change ahead of it and re-laid-out the outgoing step mid-exit. See
     * FormScreen in GatewayShell. */
    const current =
        step === "name" ? (
            <NameStep values={values} onNext={onName} loading={loading} fill={!isDesktop} />
        ) : step === "handle" ? (
            <HandleStep
                values={values}
                onNext={onHandle}
                onBack={back}
                checkHandle={checkHandle}
                loading={loading}
                fill={!isDesktop}
            />
        ) : step === "birthday" ? (
            <BirthdayStep
                values={values}
                onNext={onBirthday}
                onBack={back}
                loading={loading}
                fill={!isDesktop}
                /* The birthday step only "enters the parish" when it is the last one. With
                 * the push step still to come it is an ordinary Continue, so the button does
                 * not promise an arrival that is one screen away. */
                submitLabel={askPush ? "Continue" : "Enter the parish"}
            />
        ) : (
            <NotificationsStep
                onDone={onNotifications}
                onBack={back}
                loading={loading}
                fill={!isDesktop}
            />
        )

    return (
        <GatewayShell
            heading={copy.heading}
            subheading={copy.subheading}
            /* Mobile drops the mark and pins the action above the keyboard; desktop keeps
             * the centred hero. See GatewayShell. */
            layout="form"
            screenKey={step}
            onBack={back}
        >
            {isDesktop ? (
                <motion.div
                    /* `mode="wait"` unmounts the outgoing step before mounting the incoming
                     * one, so there is a frame where nothing is measured and the height
                     * reads 0. Passing `undefined` for that frame tells motion not to touch
                     * the property, holding the box at its last height instead of collapsing
                     * and springing back. `initial={false}` keeps the first measurement from
                     * animating in from nothing on mount. */
                    initial={false}
                    animate={{ height: bounds.height > 0 ? bounds.height : undefined }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="relative w-full overflow-hidden"
                >
                    <div ref={measureRef} className="flex w-full flex-col items-center">
                        <AnimatePresence mode="wait" initial={false}>
                            <Transition fast key={step} className={STEP_CLASS}>
                                {current}
                            </Transition>
                        </AnimatePresence>
                    </div>
                </motion.div>
            ) : (
                /* `min-h-0` so the column can be squeezed by the keyboard rather than
                 * overflowing past the bottom of the screen with the button on it. */
                <div className="flex min-h-0 flex-1 flex-col">{current}</div>
            )}
        </GatewayShell>
    )
}

export default WelcomePage
