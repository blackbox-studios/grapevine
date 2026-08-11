"use client"

import { motion } from "motion/react"

import Ripple from "@/assets/svg/ripple.svg"
import TypeLogo from "@/assets/svg/type-logo.svg"
import GlossyMark, { paletteFor, useMarkCycle } from "@/components/GlossyMark"
import Hyperlink from "@/components/Hyperlink"
import Transition from "@/components/Transition"
import { Button } from "@/components/ui/button"
import { useLogin } from "@/lib/store/auth/hook"

/* Demo mode: credentials are ignored, so the single button signs straight in. */
const DEMO_CREDENTIALS = { email: "admin@scrolls.chat", password: "admin@scrolls.chat" }

const LoginPage = () => {
    const { login, loading, clearError } = useLogin()
    const { from, to, advance } = useMarkCycle()

    /* The button wears whatever colour the mark is currently wearing. It updates
     * when the logo is tapped, via a custom property — Tailwind tokens can't
     * express the runtime palette. Every accent clears contrast against white text,
     * so the label stays white throughout. */
    const palette = paletteFor(to)

    const handleSignIn = async () => {
        clearError()
        await login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)
    }

    return (
        <div
            className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-background"
            style={{ "--mark-accent": palette.accent }}
        >
            {/* Wordmark, desktop only. Its paths ship as solid white, so recolour
              * them with currentColor to track the theme. */}
            <TypeLogo
                aria-label="Synaxis"
                className="absolute left-10 top-8 hidden h-12 w-auto text-(--mark-accent) [&_path]:fill-current lg:block"
            />

            {/* Mobile spreads the mark across the free space with the button pinned
              * low; desktop (lg) collapses that and centres the whole stack, adding
              * the welcome copy between the mark and the button. */}
            <main className="flex flex-1 flex-col lg:items-center lg:justify-center lg:gap-8 lg:py-16">
                <div className="flex flex-1 items-center justify-center px-8 lg:flex-none lg:px-0">
                    <GlossyMark
                        from={from}
                        to={to}
                        onClick={advance}
                        className="w-[min(40vw,15rem)] lg:w-32"
                    />
                </div>

                {/* Everything but the mark fades in together, ~0.75s after mount, via
                  * the shared Transition. The button colour cross-fades in CSS and its
                  * press scale is motion's, so neither has to share this duration. */}
                <Transition
                    delay={0.75}
                    className="flex h-auto w-full flex-col items-center gap-6 px-6 pb-12 sm:pb-16 lg:gap-8 lg:px-0 lg:pb-0"
                >
                    <div className="hidden flex-col items-center gap-1.5 text-center lg:flex">
                        <h1 className="font-heading text-2xl font-semibold text-foreground">
                            Welcome to Synaxis
                        </h1>
                        <p className="font-medium leading-2 tracking-normal text-muted-foreground font-heading">
                            By Holy Trinity Cathedral
                        </p>
                    </div>

                    <div className="flex w-full max-w-88 flex-col items-center gap-5">
                        <Button
                            asChild
                            size="lg"
                            className="h-14 w-full bg-(--mark-accent) text-white transition-all duration-500 hover:bg-(--mark-accent) hover:opacity-90"
                        >
                            <motion.button
                                type="button"
                                disabled={loading}
                                onClick={handleSignIn}
                                whileTap={{ scale: 0.96 }}
                                transition={{ type: "spring", stiffness: 700, damping: 32, mass: 0.6 }}
                            >
                                {loading ? (
                                    <Ripple aria-label="Signing in" className="size-8 [&_circle]:stroke-current" />
                                ) : (
                                    "Sign in with email"
                                )}
                            </motion.button>
                        </Button>

                        <div className="max-w-72 text-center text-xs leading-relaxed text-muted-foreground">
                            By continuing you agree to the&nbsp;
                            <Hyperlink >System User Agreement</Hyperlink>
                            &nbsp;and&nbsp;
                            <Hyperlink >Privacy Policy</Hyperlink>
                        </div>
                    </div>
                </Transition>
            </main>
        </div>
    )
}

export default LoginPage
