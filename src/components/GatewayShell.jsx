"use client"

import Ripple from "@/assets/svg/ripple.svg"
import TypeLogo from "@/assets/svg/type-logo.svg"
import GlossyMark, { paletteFor, useMarkCycle } from "@/components/GlossyMark"
import Transition from "@/components/Transition"
import { Button } from "@/components/ui/button"
import { motion } from "motion/react"

/* The chrome shared by every screen that stands between arriving and being in the app:
 * sign-in, first-run orientation, and the access-removed notice.
 *
 * It exists so those three cannot drift. They are one continuous experience from the
 * viewer's side — you sign in and are carried onward — and that reads as continuous only
 * if the mark sits in the same place, the content fades in on the same delay, and the
 * button is the same object throughout. Three copies of this markup would diverge the
 * first time one of them was touched.
 *
 * The accent is a runtime value, not a Tailwind token: tapping the mark cycles the palette
 * and the button follows it through the `--mark-accent` custom property. Every accent
 * clears contrast against white, so the label stays white throughout. */
const GatewayShell = ({ heading, subheading, children, footer }) => {
    const { from, to, advance } = useMarkCycle()
    const palette = paletteFor(to)

    return (
        <div
            className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-background"
            style={{ "--mark-accent": palette.accent }}
        >
            {/* Wordmark, desktop only. Its paths ship as solid white, so recolour them with
              * currentColor to track the theme. */}
            <TypeLogo
                aria-label="Synaxis"
                className="absolute left-10 top-8 hidden h-12 w-auto text-(--mark-accent) [&_path]:fill-current lg:block"
            />

            {/* Mobile spreads the mark across the free space with the content pinned low;
              * desktop (lg) collapses that and centres the whole stack. */}
            <main className="flex flex-1 flex-col lg:items-center lg:justify-center lg:gap-8 lg:py-16">
                <div className="flex flex-1 items-center justify-center px-8 lg:flex-none lg:px-0">
                    <GlossyMark
                        from={from}
                        to={to}
                        onClick={advance}
                        className="w-[min(40vw,15rem)] lg:w-32"
                    />
                </div>

                {/* Everything but the mark fades in together, ~0.75s after mount. Keeping
                  * that single delay here is what makes the three screens feel like one. */}
                <Transition
                    delay={0.75}
                    className="flex h-auto w-full flex-col items-center gap-6 px-6 pb-12 sm:pb-16 lg:gap-8 lg:px-0 lg:pb-0"
                >
                    {(heading || subheading) && (
                        <div className="flex flex-col items-center gap-1.5 px-4 text-center">
                            {heading && (
                                <h1 className="font-heading text-2xl font-semibold text-foreground">
                                    {heading}
                                </h1>
                            )}
                            {subheading && (
                                <p className="font-heading font-medium leading-snug tracking-normal text-muted-foreground">
                                    {subheading}
                                </p>
                            )}
                        </div>
                    )}

                    {children}

                    {footer}
                </Transition>
            </main>
        </div>
    )
}

/* The one primary action these screens offer, so its height, radius, accent and press
 * spring are defined once. `loading` swaps the label for the ripple rather than for
 * "Loading…" text, per the repo's action-button rule — a text swap shifts the width and
 * reads as a different control. */
export const GatewayButton = ({ children, loading, busyLabel = "Working", ...props }) => (
    <Button
        asChild
        size="lg"
        className="h-14 w-full bg-(--mark-accent) text-white transition-all duration-500 hover:bg-(--mark-accent) hover:opacity-90"
    >
        <motion.button
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 700, damping: 32, mass: 0.6 }}
            {...props}
        >
            {loading ? (
                <Ripple aria-label={busyLabel} className="size-8 [&_circle]:stroke-current" />
            ) : (
                children
            )}
        </motion.button>
    </Button>
)

export default GatewayShell
