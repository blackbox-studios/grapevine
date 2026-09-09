"use client"

import { AnimatePresence } from "motion/react"

import Prologue, {
    DayStepper,
    PrologueError,
    PrologueTitle,
    SAMPLE_DAY,
} from "@/components/Prologue"
import { Blurred } from "@/components/Skeleton"
import Transition from "@/components/Transition"
import { usePrologue } from "@/lib/store/prologue/hook"

/* The Daily Read — the Prologue of Ohrid and the day's fasting rule.
 *
 * A static route with no date in the URL, and that is the whole design: this is the reading
 * for *today*, which is a place rather than a resource somebody links to. The stepper moves a
 * day either side without changing the URL for the same reason — a day is a thing you glance
 * at and come back from, not one you share — and the native export therefore needs no
 * `generateStaticParams`, because there is no dynamic segment to enumerate.
 *
 * Not scoped to a group, so there is no switcher and no admin anything: the same text is read
 * in every parish, which is why it sits beside Home in the nav.
 *
 * **The title block is outside the cross-fade and the reading is inside it**, which is what
 * puts the seam directly under the switcher. Everything above it holds still: the mark is the
 * same on every day, the date reads instantly, and the control being tapped must not fade out
 * from under the finger — nor disappear on a day that is still loading or has failed, which is
 * the only reason a reader could step off one.
 *
 * `mode="wait"` rather than an overlap: the two days are different lengths, so cross-fading
 * them at once would leave the page jumping to the taller one mid-fade. `initial={false}`
 * keeps the first day from fading in behind the app's own page transition. */
const ProloguePage = () => {
    const { day, date, skeleton, error, retry, dates, index, select } = usePrologue()

    return (
        <div className="flex w-full flex-col items-center gap-6 pb-16">
            <PrologueTitle date={day?.date} observance={day?.fasting}>
                <DayStepper dates={dates} index={index} onSelect={select} />
            </PrologueTitle>

            <AnimatePresence mode="wait" initial={false}>
                <Transition key={date} fast className="flex justify-center">
                    {error ? (
                        <PrologueError message={error?.[0]} onRetry={retry} />
                    ) : (
                        <Blurred loading={skeleton} className="flex w-full justify-center">
                            <Prologue day={day ?? SAMPLE_DAY} />
                        </Blurred>
                    )}
                </Transition>
            </AnimatePresence>
        </div>
    )
}

export default ProloguePage
