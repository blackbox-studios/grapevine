"use client"

import Ripple from "@/assets/svg/ripple.svg"
import TypeLogo from "@/assets/svg/type-logo.svg"
import GlossyMark, { paletteFor, useMarkCycle } from "@/components/GlossyMark"
import Icon from "@/components/Icon"
import Transition from "@/components/Transition"
import { Button } from "@/components/ui/button"
import { useEntered } from "@/lib/hooks/useEntered.hook"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

/* How long everything but the mark waits before fading in: the entrance spring is still
 * travelling for most of it, so the content arrives to a mark that has landed rather than
 * racing it. Both layouts read from it, which is what keeps them staggering alike. */
const CONTENT_DELAY = 0.75

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
/* The keyboard-safe variant, mobile only.
 *
 * The hero layout below centres a large mark with the content pinned low, which is right
 * for a screen you look at and wrong for one you type into: raise the keyboard on a short
 * phone and the primary action is underneath it. The reader cannot submit, and — worse —
 * there is nothing on screen to suggest the button exists at all.
 *
 * So a screen that asks questions gets this instead: the mark drops, the question moves to
 * the top where it stays legible above the keyboard, and the action is pushed to the foot
 * of a column that is exactly as tall as the *visible* viewport. The pattern is XChat's,
 * and it is the standard shape for a mobile form for good reason — the answer is under your
 * eyes and the button is under your thumb, with the keyboard between them.
 *
 * Two custom properties do the work, both already defined in globals.css and driven by
 * `useKeyboardInset` on iOS:
 *
 *   --viewport-height   100dvh minus the keyboard, so the column ends where the keyboard
 *                       begins rather than behind it
 *   --form-bottom       the gap under the action — the home indicator when the keyboard is
 *                       down, a small constant when it is up
 *
 * Pointedly **not** `--bottom-inset`, which is the right token for a surface sized in plain
 * `dvh` and the wrong one here: this column's height has already excluded the keyboard, so
 * padding by the keyboard again strands the button a whole keyboard's height above the
 * keyboard. That was the first version of this layout, and it read exactly as the mistake it
 * was.
 *
 * The transition matches the keyboard's own animation, which has only just started when the
 * inset lands — so the two travel together instead of the button snapping into place after.
 * See the keyboard section of native-architecture.md.
 *
 * Desktop keeps the hero layout unchanged: there is no on-screen keyboard to dodge, and the
 * mark is the whole first impression of the app.
 *
 * **Nothing may sit below the action** — on a screen with a keyboard. The bottom edge of
 * this column is the top of the keyboard, so every element placed after the button pushes it
 * up by its own height and opens a gap the reader reads as a mistake. Secondary things — an
 * explanatory note, a resend link — belong above the action or up by the field they
 * describe. That is also why the way back is an arrow at the top rather than a text link at
 * the bottom.
 *
 * `mark` is the exception, and marks the one screen in the flow that asks for nothing: the
 * opening one. It centres the mark and the heading in the free space, the way the sign-in
 * screens did before the keyboard forced everything upward — and because no keyboard can
 * appear there, its `footer` is free to sit *under* the action, which is where legal copy
 * belongs. On every other screen the footer goes above the fields. */
/* One screen's entire contents — the way back, the mark or heading, the footer, the fields
 * and the action — as a single block.
 *
 * **This grouping is the whole point, not an organizational nicety.** These parts used to be
 * rendered directly by the layout while only `children` was inside the page's transition, so
 * a step change swapped the heading, dropped the mark and rewrote the container's flex rules
 * *immediately*, while the outgoing step stayed mounted for the length of its exit. The old
 * screen was then laid out under the new screen's rules and visibly teleported before fading
 * — measured at a 560px jump on the intro → email step, which reads exactly like a bug.
 * Keyed as one unit, an exiting screen keeps its own heading, its own mark and its own
 * geometry for as long as it is on screen. */
const FormScreen = ({ heading, subheading, children, footer, onBack, mark, revealed }) => {
    const reduceMotion = useReducedMotion()

    /* The mark lands, then the rest follows it in. Only on the screen that carries one: a
     * screen with nothing to wait for must not make the reader wait. */
    const reveal =
        mark && !reduceMotion
            ? {
                  animate: { opacity: revealed ? 1 : 0.01 },
                  transition: { duration: 0.3, ease: "easeInOut", delay: CONTENT_DELAY },
              }
            : {}

    return (
        <div className="flex h-full w-full flex-col">
            {/* Reserved whether or not there is a way back, so the heading sits at the same
             * height on every step and does not jump as the arrow appears.
             *
             * `size-11` is 44px — Apple's minimum touch target, and worth stating explicitly
             * because the glyph inside is roughly half that. The negative margin pulls the
             * box's padding back out to the column's edge so the *icon* still lines up with
             * the heading below it. */}
            <div className="flex h-11 shrink-0 items-center">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label="Back"
                        className="-ml-2.5 flex size-11 cursor-pointer items-center justify-center text-foreground transition-opacity active:opacity-60"
                    >
                        <Icon size="xl">arrow_back</Icon>
                    </button>
                )}
            </div>

            {mark ? (
                /* The opening screen: mark over a centred heading, floating in the space the
                 * absent fields leave behind. */
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 pb-4 text-center">
                    {mark}
                    <motion.div {...reveal} className="flex flex-col gap-2">
                        <h1 className="text-3xl font-semibold leading-tight text-foreground">
                            {heading}
                        </h1>
                        {subheading && (
                            <p className="font-heading leading-snug text-muted-foreground">
                                {subheading}
                            </p>
                        )}
                    </motion.div>
                </div>
            ) : (
                (heading || subheading) && (
                    /* Left-aligned and large, unlike the hero's centred stack. A question
                     * reads as a question when it sits where reading starts. */
                    <div className="flex shrink-0 flex-col gap-2 pt-2 pb-6">
                        {heading && (
                            <h1 className="text-3xl font-semibold leading-tight text-foreground">
                                {heading}
                            </h1>
                        )}
                        {subheading && (
                            <p className="font-heading leading-snug text-muted-foreground">
                                {subheading}
                            </p>
                        )}
                    </div>
                )
            )}

            {footer && !mark && <div className="shrink-0 pb-4">{footer}</div>}

            {/* `min-h-0` so this can actually give up space when the keyboard takes it —
             * without it a flex child refuses to shrink below its content and pushes the
             * action back off the bottom, which is the very bug this layout exists to fix.
             * On the opening screen the centred block above has already claimed the free
             * space, so this is only as tall as the action itself. */}
            <motion.div
                {...reveal}
                className={cn("flex flex-col", mark ? "shrink-0" : "min-h-0 flex-1")}
            >
                {children}
            </motion.div>

            {footer && mark && (
                <motion.div {...reveal} className="shrink-0 pt-4">
                    {footer}
                </motion.div>
            )}
        </div>
    )
}

/* The keyboard-safe frame, and the one thing in it that does *not* swap per screen: the
 * height and the bottom padding, which answer to the keyboard rather than to the step.
 * Keeping them on the outer element means the column keeps breathing with the keyboard
 * across a step change instead of being re-created mid-animation.
 *
 * The screens cross-fade **stacked, not sequentially**. `mode="wait"` would hold the
 * incoming screen back until the outgoing one finished, which is what left the heading and
 * the body changing 180ms apart; overlapping them absolutely means both are present for the
 * whole fade and neither can disturb the other's layout. */
const FormLayout = ({ screenKey, ...screen }) => (
    <main className="flex h-(--viewport-height) w-full flex-col px-6 pt-(--form-top) pb-(--form-bottom) transition-[height,padding-bottom] duration-250 ease-out">
        <div className="relative min-h-0 flex-1">
            <AnimatePresence initial={false}>
                <Transition fast key={screenKey} className="absolute inset-0 h-auto">
                    <FormScreen {...screen} />
                </Transition>
            </AnimatePresence>
        </div>
    </main>
)

const GatewayShell = ({
    heading,
    subheading,
    children,
    footer,
    layout = "hero",
    onBack,
    /* Show the mark on this screen's mobile form layout. Only the opening screen of a flow
     * should: everywhere else the space it wants is the space the keyboard takes. */
    mark = false,
    /* Identifies *which* screen of a flow this is, so the form layout can cross-fade the
     * whole thing when it changes. A page that renders several screens through one shell
     * must pass it; one that renders a single screen can leave it alone. */
    screenKey = "screen",
}) => {
    const { from, to, advance } = useMarkCycle()
    const palette = paletteFor(to)
    const isDesktop = useIsDesktop()
    /* Held here rather than in FormScreen: the screens remount as the flow steps, so a flag
     * living there would replay the wait every time the opening screen came back. */
    const entered = useEntered()

    /* The variant is a *mobile* decision, not a route one: the same screen is a hero on a
     * desktop and a form on a phone. `useIsDesktop` is reactive, so a rotated tablet or a
     * resized window swaps between them live. */
    if (layout === "form" && !isDesktop) {
        return (
            <div
                className="relative w-full overflow-hidden bg-background"
                style={{ "--mark-accent": palette.accent }}
            >
                <FormLayout
                    screenKey={screenKey}
                    heading={heading}
                    subheading={subheading}
                    footer={footer}
                    onBack={onBack}
                    revealed={entered}
                    /* Smaller than the hero's, which is sized to fill a screen with nothing
                     * else on it. Still tappable, so the palette cycle survives. */
                    mark={
                        mark ? (
                            <GlossyMark
                                from={from}
                                to={to}
                                onClick={advance}
                                className="w-[min(32vw,9rem)]"
                            />
                        ) : null
                    }
                >
                    {children}
                </FormLayout>
            </div>
        )
    }

    return (
        <div
            className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-background"
            style={{ "--mark-accent": palette.accent }}
        >
            {/* Wordmark, desktop only. Its paths already ship as currentColor, so it
              * tracks the theme through the text colour alone. */}
            <TypeLogo
                aria-label="Grapevine"
                className="absolute left-10 top-8 hidden h-12 w-auto text-(--mark-accent) lg:block"
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

                {/* Everything but the mark fades in together. */}
                <Transition
                    delay={CONTENT_DELAY}
                    className="flex h-auto w-full flex-col items-center gap-6 px-6 pb-12 sm:pb-16 lg:gap-8 lg:px-0 lg:pb-0"
                >
                    {(heading || subheading) && (
                        <div className="flex flex-col items-center gap-1.5 px-4 text-center">
                            {heading && (
                                <h1 className="text-3xl font-semibold text-foreground">
                                    {heading}
                                </h1>
                            )}
                            {subheading && (
                                <p className="font-heading leading-snug tracking-normal text-muted-foreground">
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
