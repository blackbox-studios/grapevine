"use client"

import { Fragment, useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "motion/react"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import useMeasure from "react-use-measure"
import { z } from "zod"

import GatewayShell, { GatewayButton } from "@/components/GatewayShell"
import Hyperlink from "@/components/Hyperlink"
import Transition from "@/components/Transition"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from "@/components/ui/form"
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSeparator,
    InputOTPSlot,
} from "@/components/ui/input-otp"
import { Input } from "@/components/ui/input"
import { OTP_LENGTH } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useLogin } from "@/lib/store/auth/hook"
import { cn } from "@/lib/utils"

/* The wrapper each step fades in through — a column so the step's form can grow to the full
 * keyboard-safe height on mobile, which is what puts its action at the bottom. `items-center`
 * does the horizontal centring the old row did. */
const STEP_CLASS = "flex min-h-0 w-full flex-1 flex-col items-center"

/* Sign-in, in three screens: an opening one, the address, then the one-time code Supabase
 * emails back.
 *
 * **Why the opening screen asks for nothing.** The address field used to sit on it, under
 * the mark, which is fine on a desktop and wrong on a phone: tapping it raises the keyboard
 * over the mark, the legal copy, and — before this layout — the button itself. Splitting it
 * out means the first thing a visitor sees is the app identifying itself, and the moment
 * they commit to signing in they get a screen built for typing. It also lets the rest of the
 * flow share one shape with first-run orientation, so signing in and being set up read as
 * one continuous sequence rather than two designs meeting in the middle.
 *
 * **Why a code rather than the magic link.** A link has to redirect somewhere, and the
 * Capacitor WebView has no origin to redirect to — the boot guard in `app/layout.jsx`
 * rewrites any non-root URL to "/" before hydration, so a callback would be discarded
 * before anything could read it. Making a link work natively needs a custom URL scheme and
 * the Capacitor Browser/App plugins; a code needs nothing, and web and native then run the
 * same path. See auth-architecture.md.
 *
 * The account is never created here. `signInWithOtp({ shouldCreateUser: false })` in the
 * store means an address with no account cannot be sent a code at all, which is what makes
 * the app invite-only — so this screen has no sign-up affordance by design. */

const emailSchema = z.object({
    email: z.email("Enter a valid email address"),
})

/* Validation is deliberately a *range*, not `OTP_LENGTH` exactly.
 *
 * The code length is a Supabase dashboard setting (Authentication → Sign In / Providers →
 * Email → Email OTP Length), set to 6 on this project — note that a fresh Supabase project
 * defaults to 8. Pinning the regex to one number means someone changing that setting silently locks
 * every user out of the app, with the form rejecting a code that is perfectly valid. The
 * check exists only to avoid spending a round trip and a rate-limit slot on something
 * obviously incomplete — the server is what actually decides whether a code is right, so
 * being generous here costs nothing. */
const codeSchema = z.object({
    code: z
        .string()
        .trim()
        .regex(/^\d{6,10}$/, "Enter the code from your email"),
})

/* Both steps take `fill`, which is the mobile layout: the form grows to the height the
 * keyboard leaves and its action is `mt-auto`, so the button sits flush on top of the
 * keyboard instead of under it. Everything secondary — the "we sent a code to" line, the
 * resend row — stays *above* the button, because anything after it opens a gap between the
 * action and the keyboard. See the FormLayout note in GatewayShell. */
const ACTION_CLASS = (fill) => cn("w-full", fill && "mt-auto shrink-0 pt-6")

/* Whether this step's answer is complete enough to submit — what fades the action.
 *
 * Parsed from the schema against the watched values rather than read off
 * `formState.isValid`, which only tracks live in `onChange` mode; switching there would put
 * "Enter a valid email address" under the field after the first character typed. Validity
 * drives the button continuously, errors still wait for a submit. */
const useStepValid = (form, schema) => {
    const values = useWatch({ control: form.control })
    return schema.safeParse(values).success
}

const EmailStep = ({ onSubmit, loading, fill }) => {
    const form = useForm({
        resolver: zodResolver(emailSchema),
        defaultValues: { email: "" },
    })

    const valid = useStepValid(form, emailSchema)

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(({ email }) => onSubmit(email))}
                className={cn(
                    "flex w-full flex-col items-center gap-5",
                    fill ? "min-h-0 flex-1" : "max-w-88",
                )}
            >
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem className="w-full">
                            <FormControl>
                                <Input
                                    type="email"
                                    inputMode="email"
                                    autoComplete="email"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    placeholder="you@parish.org"
                                    disabled={loading}
                                    aria-label="Email address"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage className="px-5" />
                        </FormItem>
                    )}
                />

                <div className={ACTION_CLASS(fill)}>
                    <GatewayButton
                        type="submit"
                        disabled={loading || !valid}
                        loading={loading}
                        busyLabel="Sending your code"
                    >
                        Continue with email
                    </GatewayButton>
                </div>
            </form>
        </Form>
    )
}

/* Slot layout for the code entry: two balanced groups read far better than one long run of
 * boxes. Derived from OTP_LENGTH rather than hardcoded, so changing the code length in the
 * Supabase dashboard (and the constant) reshapes the field instead of breaking it. An odd
 * length falls back to a single group. */
const OTP_GROUPS =
    OTP_LENGTH % 2 === 0 ? [OTP_LENGTH / 2, OTP_LENGTH / 2] : [OTP_LENGTH]

const groupOffset = (groupIndex) =>
    OTP_GROUPS.slice(0, groupIndex).reduce((total, count) => total + count, 0)

const CodeStep = ({ onSubmit, onResend, onBack, loading, resendIn, fill }) => {
    const form = useForm({
        resolver: zodResolver(codeSchema),
        defaultValues: { code: "" },
    })

    const submit = form.handleSubmit(({ code }) => onSubmit(code))
    const valid = useStepValid(form, codeSchema)

    return (
        <Form {...form}>
            <form
                onSubmit={submit}
                className={cn(
                    "flex w-full flex-col items-center gap-5",
                    fill ? "min-h-0 flex-1" : "max-w-88",
                )}
            >
                {/* The address the code went to is the screen's subheading now, not a line
                  * inside the form — it belongs with the question, and putting it here cost
                  * two lines of vertical space that the keyboard wants. */}
                <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                        <FormItem className="flex w-full flex-col items-center">
                            <FormControl>
                                <InputOTP
                                    maxLength={OTP_LENGTH}
                                    /* Digits only, so a stray letter cannot occupy a slot. */
                                    pattern={REGEXP_ONLY_DIGITS}
                                    /* The reader has just switched to their mail app and
                                     * back; the one thing they want to do is type. */
                                    autoFocus
                                    /* `one-time-code` is what lets iOS and Android offer the
                                     * code straight from the notification, which is the whole
                                     * reason this flow is usable on a phone. */
                                    autoComplete="one-time-code"
                                    disabled={loading}
                                    aria-label="Sign-in code from your email"
                                    containerClassName="w-full justify-center gap-2"
                                    /* Filling the last slot submits. Standard for a code
                                     * field, and it is the difference between one gesture and
                                     * three on a phone. The button stays for the paste case
                                     * and for anyone who backspaces after completing. */
                                    onComplete={() => submit()}
                                    {...field}
                                >
                                    {OTP_GROUPS.map((count, groupIndex) => (
                                        <Fragment key={groupIndex}>
                                            {groupIndex > 0 && <InputOTPSeparator />}
                                            {/* The groups share the row and the slots inside
                                              * them flex to fill it, rather than each slot
                                              * being a fixed square. Fixed squares overflow
                                              * the content column on a narrow phone, and the
                                              * overflow was centred, so the code got clipped
                                              * at *both* ends.
                                              *
                                              * **Nothing caps a slot's width.** There was a
                                              * `max-w-11` here, sized for eight digits, where
                                              * the slots wanted more than the column had and
                                              * so the cap never bound. At six it does bind:
                                              * the row needs 264px of a ~345px column, and
                                              * the 49px left over stranded the field short of
                                              * both edges and pushed the separator off the
                                              * optical centre. The container is already
                                              * bounded — `max-w-88` on desktop, the shell's
                                              * `px-6` column on mobile — so a second bound
                                              * here only under-fills whatever it doesn't
                                              * anticipate. Slots are ~52x44 at six digits and
                                              * resize with the length. */}
                                            <InputOTPGroup className="min-w-0 flex-1">
                                                {Array.from({ length: count }, (_, slot) => (
                                                    <InputOTPSlot
                                                        key={slot}
                                                        index={groupOffset(groupIndex) + slot}
                                                        className="h-11 min-w-0 flex-1 rounded-none border-transparent bg-muted text-base first:rounded-l-xl last:rounded-r-xl"
                                                    />
                                                ))}
                                            </InputOTPGroup>
                                        </Fragment>
                                    ))}
                                </InputOTP>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Above the action, not below it. On mobile the button's bottom edge is
                  * the top of the keyboard, so this row would otherwise wedge itself into
                  * that seam and push the button away from the thumb. */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground pl-2">
                    {/* Supabase rejects a second code for the same address inside 60
                      * seconds, so the button waits the window out rather than firing
                      * into an error the reader can do nothing about. */}
                    <button
                        type="button"
                        onClick={onResend}
                        disabled={loading || resendIn > 0}
                        /* Fixed width and tabular figures so the row cannot move.
                         *
                         * Without both, this shifts twice over: "9s" is narrower than "58s"
                         * in a proportional face, so the countdown jitters every second and
                         * drags "Use a different email" left and right with it — and the
                         * final swap to "Resend code" moves it again. The width is reserved
                         * for the longest of the three strings, so nothing reflows at all. */
                        className="min-w-[6.5rem] cursor-pointer tabular-nums underline-offset-4 transition-opacity hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-50"
                    >
                        {resendIn > 0
                            ? `Resend in ${String(resendIn).padStart(2, "0")}s`
                            : "Resend code"}
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                        type="button"
                        onClick={onBack}
                        disabled={loading}
                        className="cursor-pointer underline-offset-4 transition-opacity hover:underline disabled:opacity-50"
                    >
                        Use a different email
                    </button>
                </div>

                <div className={ACTION_CLASS(fill)}>
                    <GatewayButton
                        type="submit"
                        disabled={loading || !valid}
                        loading={loading}
                        busyLabel="Verifying your code"
                    >
                        Sign in
                    </GatewayButton>
                </div>
            </form>
        </Form>
    )
}

const LoginPage = () => {
    const { stage, email, requestCode, verify, resend, resendIn, back, loading, clearError } =
        useLogin()
    /* Drives the height animation across the step change. */
    const [measureRef, bounds] = useMeasure()

    /* Store failures surface as toasts through useErrorListener, so each submit clears the
     * previous one first — otherwise a stale error sits under a fresh attempt. */
    const handlers = useMemo(() => ({
        email: async (address) => {
            clearError()
            await requestCode(address)
        },
        code: async (code) => {
            clearError()
            await verify(code)
        },
        resend: async () => {
            clearError()
            await resend()
        },
    }), [clearError, requestCode, verify, resend])

    /* Mobile fills the keyboard-safe column so the action pins to its foot; desktop keeps
     * the intrinsic-height stack and animates between the steps' heights. Same split as
     * first-run orientation — see the Step note in (gateway)/welcome/page.jsx. */
    const isDesktop = useIsDesktop()

    /* Whether the visitor has committed to signing in.
     *
     * Local, not in the store, and that is the point: it is a fact about this screen, not
     * about the session. `stage` from the store already knows whether a code is outstanding,
     * which is the only part worth persisting — so a reload with a code in flight lands
     * straight back on the code screen rather than at the opening one. */
    const [started, setStarted] = useState(false)
    const screen = stage === "code" ? "code" : started ? "email" : "intro"

    const legal = (
        <div className="mx-auto max-w-72 text-center text-xs leading-relaxed text-muted-foreground">
            By continuing you agree to the&nbsp;
            <Hyperlink>System User Agreement</Hyperlink>
            &nbsp;and&nbsp;
            <Hyperlink>Privacy Policy</Hyperlink>
        </div>
    )

    const COPY = {
        intro: { heading: "Welcome to Grapevine", subheading: "By Holy Trinity Cathedral" },
        email: {
            heading: "What's your email?",
            subheading: "We'll send you a code to sign in with.",
        },
        code: {
            heading: "Enter the code we sent you",
            /* No digit count in the copy: the article would have to agree with it ("a
             * 6-digit", "an 8-digit"), and the slots on screen already show the length. */
            subheading: `We sent it to ${email}.`,
        },
    }[screen]

    /* Just the current screen's body. **No AnimatePresence on mobile**: the shell cross-fades
     * the whole screen — heading, mark and body together — because animating only the body
     * left the chrome to change 180ms ahead of it, which re-laid-out the outgoing screen and
     * made it jump before fading. See FormScreen in GatewayShell. Desktop still wraps this in
     * its own transition below, where the hero chrome does not change between screens. */
    const current =
        screen === "intro" ? (
            <div className="flex w-full flex-col items-center gap-5 sm:max-w-88">
                <GatewayButton type="button" onClick={() => setStarted(true)}>
                    Continue with email
                </GatewayButton>
                {/* Under the action, which is allowed here and nowhere else in the flow:
                  * this screen has no field, so no keyboard can rise into the gap. */}
                {!isDesktop && legal}
            </div>
        ) : screen === "email" ? (
            <EmailStep onSubmit={handlers.email} loading={loading} fill={!isDesktop} />
        ) : (
            <CodeStep
                onSubmit={handlers.code}
                onResend={handlers.resend}
                onBack={back}
                loading={loading}
                resendIn={resendIn}
                fill={!isDesktop}
            />
        )

    return (
        <GatewayShell
            heading={COPY.heading}
            subheading={COPY.subheading}
            /* Mobile pins the action above the keyboard; desktop keeps the centred hero. */
            layout="form"
            /* What the shell cross-fades on. */
            screenKey={screen}
            /* The mark belongs on the opening screen only — everywhere after it, the space
             * it wants is the space the keyboard takes. */
            mark={screen === "intro"}
            /* From the address back to the opening screen; from the code back to the
             * address, which also clears the pending code so a different one can be sent. */
            onBack={
                screen === "email"
                    ? () => setStarted(false)
                    : screen === "code"
                      ? back
                      : undefined
            }
            /* Desktop keeps the legal copy in the shell's own footer on every screen. On
             * mobile the opening screen renders it under its button instead, and the typing
             * screens drop it — it has already been agreed to by then. */
            footer={isDesktop ? legal : undefined}
        >
            {isDesktop ? (
                <motion.div
                    /* The height is animated alongside the fade because the screens differ
                     * appreciably in height. Without it the legal copy below would jump the
                     * instant the swap happened, which is the exact seam the fade exists to
                     * hide.
                     *
                     * `mode="wait"` unmounts the outgoing step before mounting the incoming
                     * one, so there is a frame where nothing is measured and the height
                     * reads 0. Passing `undefined` for that frame tells motion not to touch
                     * the property, which holds the box at its last height instead of
                     * collapsing and springing back. `initial={false}` keeps the very first
                     * measurement from animating in from nothing on mount. */
                    initial={false}
                    animate={{ height: bounds.height > 0 ? bounds.height : undefined }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="relative w-full overflow-hidden"
                >
                    <div ref={measureRef} className="flex w-full flex-col items-center">
                        <AnimatePresence mode="wait" initial={false}>
                            <Transition fast key={screen} className={STEP_CLASS}>
                                {current}
                            </Transition>
                        </AnimatePresence>
                    </div>
                </motion.div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col">{current}</div>
            )}
        </GatewayShell>
    )
}

export default LoginPage
