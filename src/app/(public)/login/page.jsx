"use client"

import { Fragment, useMemo } from "react"
import { useForm } from "react-hook-form"
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
import { useLogin } from "@/lib/store/auth/hook"

/* Sign-in: email, then the one-time code Supabase emails back.
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
 * Email → Email OTP Length), currently 8 on this project despite most documentation saying
 * six. Pinning the regex to one number means someone changing that setting silently locks
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

const EmailStep = ({ onSubmit, loading }) => {
    const form = useForm({
        resolver: zodResolver(emailSchema),
        defaultValues: { email: "" },
    })

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(({ email }) => onSubmit(email))}
                className="flex w-full max-w-88 flex-col items-center gap-5"
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

                <GatewayButton type="submit" disabled={loading} loading={loading} busyLabel="Sending your code">
                    Continue with email
                </GatewayButton>
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

const CodeStep = ({ email, onSubmit, onResend, onBack, loading, resendIn }) => {
    const form = useForm({
        resolver: zodResolver(codeSchema),
        defaultValues: { code: "" },
    })

    const submit = form.handleSubmit(({ code }) => onSubmit(code))

    return (
        <Form {...form}>
            <form onSubmit={submit} className="flex w-full max-w-88 flex-col items-center gap-5">
                {/* No digit count in the copy: the article would have to agree with it
                  * ("a 6-digit", "an 8-digit"), and the slots below already show the length. */}
                <p className="px-4 text-center text-sm leading-relaxed text-muted-foreground">
                    We sent a sign-in code to
                    <br />
                    <span className="font-medium text-foreground">{email}</span>
                </p>

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
                                              * them flex, rather than each slot being a fixed
                                              * 44px square. Eight fixed squares plus the
                                              * separator need ~384px, which is wider than the
                                              * content column on any phone narrower than a Pro
                                              * Max — and the overflow was centred, so the code
                                              * was clipped at *both* ends. They still cap at
                                              * 44px, so nothing changes where there is room. */}
                                            <InputOTPGroup className="min-w-0 flex-1">
                                                {Array.from({ length: count }, (_, slot) => (
                                                    <InputOTPSlot
                                                        key={slot}
                                                        index={groupOffset(groupIndex) + slot}
                                                        className="h-11 min-w-0 max-w-11 flex-1 rounded-none border-transparent bg-muted text-base first:rounded-l-xl last:rounded-r-xl"
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

                <GatewayButton type="submit" disabled={loading} loading={loading} busyLabel="Verifying your code">
                    Sign in
                </GatewayButton>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
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

    return (
        <GatewayShell
            heading="Welcome to Synaxis"
            subheading="By Holy Trinity Cathedral"
            footer={
                <div className="max-w-72 text-center text-xs leading-relaxed text-muted-foreground">
                    By continuing you agree to the&nbsp;
                    <Hyperlink>System User Agreement</Hyperlink>
                    &nbsp;and&nbsp;
                    <Hyperlink>Privacy Policy</Hyperlink>
                </div>
            }
        >
                    {/* The two steps cross-fade rather than swapping instantly.
                      *
                      * `AnimatePresence mode="wait"` + `<Transition>` is the same pairing the
                      * feed uses for skeleton↔content — <PageTransition/> is not the tool here,
                      * because it keys off the pathname and this is one route.
                      *
                      * The height is animated alongside the fade because the code step is
                      * appreciably taller than the email step (it adds the "we sent a code to"
                      * line and the resend row). Without it the legal copy below — and, on
                      * mobile, the whole stack — would jump the instant the swap happened,
                      * which is the exact seam the fade exists to hide. */}
                    <motion.div
                        /* `mode="wait"` unmounts the outgoing step before mounting the
                         * incoming one, so there is a frame where nothing is measured and
                         * the height reads 0. Passing `undefined` for that frame tells
                         * motion not to touch the property, which holds the box at its last
                         * height instead of collapsing and springing back — the same latch
                         * a piece of state would give, without the render loop.
                         *
                         * `initial={false}` keeps the very first measurement from animating
                         * in from nothing on mount. */
                        initial={false}
                        animate={{ height: bounds.height > 0 ? bounds.height : undefined }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="relative w-full overflow-hidden"
                    >
                        <div ref={measureRef} className="flex w-full flex-col items-center">
                            {/* Remounted per stage via `key`, so each step's form starts with
                              * its own clean react-hook-form state instead of inheriting the
                              * other's — and so AnimatePresence sees a change to animate. */}
                            <AnimatePresence mode="wait" initial={false}>
                                {stage === "code" ? (
                                    <Transition fast key="code" className="flex justify-center">
                                        <CodeStep
                                            email={email}
                                            onSubmit={handlers.code}
                                            onResend={handlers.resend}
                                            onBack={back}
                                            loading={loading}
                                            resendIn={resendIn}
                                        />
                                    </Transition>
                                ) : (
                                    <Transition fast key="email" className="flex justify-center">
                                        <EmailStep onSubmit={handlers.email} loading={loading} />
                                    </Transition>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

        </GatewayShell>
    )
}

export default LoginPage
