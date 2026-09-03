"use client"

import Prologue, { PrologueError, PrologueSkeleton } from "@/components/Prologue"
import { usePrologue } from "@/lib/store/prologue/hook"

/* The Daily Read — today's Prologue of Ohrid and the day's fasting rule.
 *
 * A static route with no date in the URL, and that is the whole design: this is the reading
 * for *today*, which is a place rather than a resource somebody links to. The date the
 * client asks for is resolved from the reader's own clock inside the hook, so nothing here
 * has a segment to enumerate and the native export needs no `generateStaticParams`.
 *
 * Not scoped to a group, so there is no switcher on it and no admin anything: the same text
 * is read in every parish, which is why it sits beside Home in the nav. */
const ProloguePage = () => {
    const { day, skeleton, error, retry } = usePrologue()

    return (
        <div className="flex w-full justify-center pb-16">
            {skeleton ? (
                <PrologueSkeleton />
            ) : error ? (
                <PrologueError message={error?.[0]} onRetry={retry} />
            ) : (
                <Prologue day={day} />
            )}
        </div>
    )
}

export default ProloguePage
