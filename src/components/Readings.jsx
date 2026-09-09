"use client"

import { Fragment } from "react"

/* The day's scripture, at the head of the Daily Read.
 *
 * Set in the same face and measure as the Prologue below it, because a reader who has opened
 * this screen is reading rather than glancing: the epistle and the gospel are the appointed
 * text and the Prologue's entry is the commentary that follows them, so making the two look
 * like different features would put a seam where the reading is continuous. The one thing
 * marking them apart is the rule <Prologue/> draws between.
 *
 * The reference is the heading and the source is a small label above it: "Galatians 3:15-22"
 * is what somebody following in their own book needs, where "Epistle" only says which of the
 * day's readings this is. `occasion` sits under both whenever upstream gives one, and it is
 * the only thing on the page that accounts for a Sunday with three epistles on it: each names
 * the feast it is read for.
 *
 * Plain text throughout, like every block <Prologue/> draws — orthocal's verses arrive as
 * prose with no markup in them, and nothing here may start injecting any. */

/* Verses run together into paragraphs where upstream marks one. A whole chapter set as a
 * single block is a wall of text, and the breaks are the passage's own. */
const paragraphs = (verses) =>
    verses.reduce((groups, verse) => {
        if (!groups.length || verse.paragraph) groups.push([verse])
        else groups.at(-1).push(verse)
        return groups
    }, [])

/* A verse's number, carrying its chapter wherever the chapter turns over mid-passage.
 * "Isaiah 9:9-10:4" is one reading whose numbering restarts at 1 partway through, and a bare
 * "1" standing there reads as an error rather than as a new chapter. */
const numbered = (verses) =>
    verses.map((verse, index) => {
        const previous = verses[index - 1]
        return {
            ...verse,
            label:
                !previous || previous.chapter !== verse.chapter
                    ? `${verse.chapter}:${verse.verse}`
                    : `${verse.verse}`,
        }
    })

/* One appointed reading. Justified and hyphenated to match the prose below it — see the note
 * on <Block/> in Prologue.jsx for why those two go together on a column this narrow. */
const Reading = ({ reading }) => (
    <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-reading">
                {reading.source}
            </p>
            <h2 className="text-balance font-reading text-xl font-bold leading-snug">
                {reading.reference}
            </h2>
            {reading.occasion && (
                <p className="text-sm italic text-muted-foreground">{reading.occasion}</p>
            )}
        </div>

        {paragraphs(numbered(reading.verses)).map((group, index) => (
            <p key={index} className="text-justify hyphens-auto">
                {group.map((verse) => (
                    <Fragment key={verse.label}>
                        <sup className="mr-0.5 text-[0.7em] font-medium text-reading">
                            {verse.label}
                        </sup>
                        {verse.text}{" "}
                    </Fragment>
                ))}
            </p>
        ))}
    </section>
)

const Readings = ({ readings }) => {
    if (!readings?.length) return null

    return (
        <div className="flex flex-col gap-10 -mt-6">
            {readings.map((reading, index) => (
                <Reading key={index} reading={reading} />
            ))}
        </div>
    )
}

export default Readings
