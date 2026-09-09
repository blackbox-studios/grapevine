"use client"

import { Fragment } from "react"

import CrossVine from "@/assets/svg/monograms/cross-vine.svg"
import Fasting from "@/components/Fasting"
import Icon from "@/components/Icon"
import Skeleton from "@/components/Skeleton"
import { Button } from "@/components/ui/button"
import { haptic } from "@/lib/native"
import { cn } from "@/lib/utils"

/* The Daily Read: one day of the Prologue of Ohrid, and the day's fasting rule.
 *
 * **Renders blocks, not markup.** `lib/server/prologue/parse.js` turns the source into a
 * typed block list precisely so nothing arbitrary reaches the DOM, and the payoff is here —
 * every construct below is one this file chose to draw, and an unknown `type` renders as
 * plain text rather than as anything. There is no `dangerouslySetInnerHTML` on this screen
 * and there must not be one: the text arrives from a repository this project does not own.
 *
 * **It is the one screen in the app with a colour of its own.** The Prologue is a rubricated
 * book, and keeping that is what makes the page read as a reading rather than as another
 * Grapevine surface: the mark and the date carry the red, and it returns at the small scale
 * for list markers, footnote markers and the hymn attributions. Everything red here is
 * `text-reading`; see the token's note in globals.css for why it is not `--destructive`.
 *
 * The whole screen is set in PT Serif (`font-reading`) — the only place in the app that
 * leaves the interface sans behind — and it is set narrow and leaded loose for the one
 * reason this screen is unlike every other: it is the only one somebody sits and reads for
 * ten minutes rather than glances at. */

/* Words a title leaves lowercase unless they open or close it. */
const MINOR_WORDS = new Set([
    "a", "an", "and", "as", "at", "but", "by", "for", "from",
    "in", "of", "on", "or", "the", "to", "with",
])

const ROMAN_NUMERAL = /^[IVXLCDM]+$/

const capitalize = (word) =>
    word
        .split("-")
        .map((part) => part.replace(/\p{L}/u, (letter) => letter.toUpperCase()))
        .join("-")

/* The source sets every heading in full capitals. That is right for the four liturgical
 * labels, which are headings in the ordinary sense, and wrong for the commemorations, where
 * the heading is somebody's *name* — "THE HOLY MARTYR MAMAS" set as typed reads as shouting
 * rather than as a saint. Only the names are cased here; see <Section/>.
 *
 * A heading that already has a lowercase letter is left exactly as written: the corpus
 * casing is inconsistent, and the ones set in mixed case were cased deliberately. Hyphenated
 * parts capitalise individually ("Great-Martyr") while apostrophes do not ("God's"), which
 * is why the split is on the hyphen alone; numerals stay as written, since a regnal "II" is
 * not a word. */
const titleCase = (text) => {
    if (!text || /\p{Ll}/u.test(text)) return text

    const words = text.split(" ")

    return words
        .map((word, index) => {
            const letters = word.replace(/[^\p{L}]/gu, "")
            if (letters.length > 1 && ROMAN_NUMERAL.test(letters)) return word

            const lower = word.toLowerCase()
            const inner = index > 0 && index < words.length - 1

            return inner && MINOR_WORDS.has(letters.toLowerCase())
                ? lower
                : capitalize(lower)
        })
        .join(" ")
}

/* The three inline forms the source uses, in one pass so they cannot nest wrongly. A
 * footnote marker is drawn as a superscript and is deliberately not a link — the notes sit
 * a screen below on a page with no other jump targets, and a link that moved the reader out
 * of a paragraph they are mid-way through costs more than the marker is worth. */
const INLINE = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[\^([^\]]+)\]/g

const Inline = ({ text }) => {
    if (!text) return null

    const nodes = []
    let cursor = 0

    for (const match of text.matchAll(INLINE)) {
        const [token, bold, italic, note] = match
        if (match.index > cursor) nodes.push(text.slice(cursor, match.index))

        if (bold) nodes.push(<strong key={match.index} className="font-semibold">{bold}</strong>)
        else if (italic) nodes.push(<em key={match.index}>{italic}</em>)
        else nodes.push(
            <sup key={match.index} className="text-reading text-[0.7em] font-medium">
                {note}
            </sup>,
        )

        cursor = match.index + token.length
    }

    nodes.push(text.slice(cursor))

    return <>{nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>)}</>
}

/* One block of a section.
 *
 * A verse keeps its own line breaks, because a hymn's lines are the form rather than
 * wrapping — the same reason the parser refuses to join them. `text-balance` is left off it
 * for that reason too: balancing would re-break lines the poet chose.
 *
 * ── Justified, and hyphenated because it is justified ────────────────────────
 *
 * The printed Prologue sets its prose flush to both margins. `hyphens-auto` is the half that
 * makes that bearable rather than a flourish: a phone holds about thirty-five characters a
 * line, short enough that one long word pushed down stretches every space on the line it left,
 * and a river of white is worse than a ragged edge. It resolves against the document's
 * language, so it rests on the `lang="en"` the root layout sets.
 *
 * Prose and the numbered list only — justifying a hymn would stretch lines the poet ended
 * early, and the subtitle and epigraph are single lines with alignments of their own. */
const Block = ({ block }) => {
    switch (block.type) {
        case "subtitle":
            return (
                <p className="text-center font-reading text-lg font-bold text-reading">
                    <Inline text={titleCase(block.text)} />
                </p>
            )

        case "epigraph":
            return (
                <p className="text-right italic text-muted-foreground">
                    <Inline text={block.text} />
                </p>
            )

        case "verse":
            return (
                <p className="italic leading-relaxed">
                    {block.lines.map((line, index) => (
                        <Fragment key={index}>
                            {index > 0 && <br />}
                            <Inline text={line} />
                        </Fragment>
                    ))}
                </p>
            )

        case "list":
            return (
                <ol className="flex list-decimal flex-col gap-4 pl-6 text-justify hyphens-auto marker:text-reading marker:font-semibold">
                    {block.items.map((item, index) => (
                        <li key={index} className="pl-1">
                            <Inline text={item} />
                        </li>
                    ))}
                </ol>
            )

        default:
            return (
                <p className="text-justify hyphens-auto">
                    <Inline text={block.text} />
                </p>
            )
    }
}

/* A saint's life or one of the four closing sections — the same blocks either way, and the
 * only thing that differs is the heading.
 *
 * `label` marks the four liturgical ones (Hymn of Praise, Reflection, Contemplation, Homily).
 * Those keep the source's capitals, because each names a standing part of the day's office; a
 * commemoration gets title case, because it is a person's name. The caller knows which is
 * which without inspecting the text — the parser has already sorted them into `lives` and the
 * four keys.
 *
 * Capitals need the extra tracking to stay readable at this size; lowercase does not, and
 * would look gappy with it.
 *
 * A heading with no blocks is a real thing in the source (a synaxis named on the day but
 * written up under the hymn), so an empty body is drawn rather than guarded against. */
const Section = ({ section, label }) => {
    if (!section) return null

    /* A Hymn or a Homily opens with an attribution — whom it is sung to, what it is preached
     * on — and that line belongs to the heading rather than to the body it sits above. So it
     * is lifted into the heading's own group and set at half the section gap: the two read as
     * one title, and the body starts at the full gap below them both. Grouping rather than
     * pulling the line up with a negative margin, so the two spacings stay related by the
     * markup instead of by a number that has to be re-derived whenever `gap-4` changes. */
    const [lead, ...rest] = section.blocks
    const titled = lead?.type === "subtitle"

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
                <h2
                    className={cn(
                        "text-balance text-center font-reading text-xl font-bold leading-snug",
                        label && "uppercase",
                    )}
                >
                    {label ? section.heading : titleCase(section.heading)}
                </h2>
                {titled && <Block block={lead} />}
            </div>
            {(titled ? rest : section.blocks).map((block, index) => (
                <Block key={index} block={block} />
            ))}
        </section>
    )
}

/* What each reachable day is called, oldest first, matching the `dates` the hook hands over.
 * Named rather than dated because the stepper reaches exactly one day either side and these
 * are then exact — and because the date itself is already the heading directly below. */
const DAY_LABELS = ["Yesterday", "Today", "Tomorrow"]

/* Previous day, today, next day — the carousel dots a photo slide uses, for the same reason:
 * a handful of positions, where being able to see how many there are and which one you are on
 * matters more than being able to jump to any of them.
 *
 * It exists because the commemoration turns over at vespers rather than at midnight, so an
 * evening reader is often after tomorrow's saint. That is a step, not a date to be chosen,
 * which is why there is no calendar here — the reach is one day and the dots make that
 * legible at a glance instead of implying a range nothing will answer for.
 *
 * The dots are buttons in their own right, so the whole control works by tapping the position
 * you want as well as by stepping to it; each carries its own name, and the hit area is padded
 * out to a thumb while the dot itself stays small. */
export const DayStepper = ({ dates, index, onSelect }) => {
    if (index < 0) return null

    /* Inside the bounds check, so the tap that buzzes is the one that moved the day.
     * "light", because a day is chrome sliding past rather than something being committed to
     * — the weight the group switcher opens on. The dots are left silent: an arrow is a
     * repeated gesture a thumb rests on, which is what a haptic is worth having for. */
    const step = (delta) => {
        const next = index + delta
        if (next < 0 || next >= dates.length) return
        haptic("light")
        onSelect(dates[next])
    }

    return (
        <nav aria-label="Reading day" className="flex items-center gap-1">
            <button
                type="button"
                onClick={() => step(-1)}
                disabled={index === 0}
                aria-label={`Go to ${DAY_LABELS[index - 1]?.toLowerCase() ?? "the previous day"}`}
                className="flex size-9 items-center justify-center rounded-full text-reading transition-colors hover:text-reading/80 disabled:pointer-events-none disabled:opacity-25 cursor-pointer"
            >
                <Icon size="xl">chevron_left</Icon>
            </button>

            {dates.map((date, position) => (
                <button
                    key={date}
                    type="button"
                    onClick={() => onSelect(date)}
                    aria-label={DAY_LABELS[position]}
                    aria-current={position === index ? "date" : undefined}
                    className="flex size-9 items-center justify-center"
                >
                    <span
                        className={cn(
                            "block size-2 rounded-full transition-all duration-300",
                            position === index
                                ? "w-5 bg-reading"
                                : "bg-muted-foreground/30",
                        )}
                    />
                </button>
            ))}

            <button
                type="button"
                onClick={() => step(1)}
                disabled={index === dates.length - 1}
                aria-label={`Go to ${DAY_LABELS[index + 1]?.toLowerCase() ?? "the next day"}`}
                className="flex size-9 items-center justify-center rounded-full text-reading transition-colors hover:text-reading/80 disabled:pointer-events-none disabled:opacity-25 cursor-pointer"
            >
                <Icon size="xl">chevron_right</Icon>
            </button>
        </nav>
    )
}

/* The mark, the date, and the day switcher beneath it.
 *
 * Hoisted out of <Prologue/> and mounted whatever the reading is doing, which is what the
 * switcher needs to work at all: a control must not fade out from under the finger tapping
 * it, and a reader has to be able to step off a day that is still loading or has failed —
 * neither of which is possible if the stepper lives inside the article it steps between.
 *
 * Nothing in here fades. The mark is the same on every day, and the date is one short line
 * that is legible the instant it changes — cross-fading it would draw the eye to the one part
 * of a step that needs no announcing, and would blink the block the switcher is anchored to.
 * The date is the *server's* rendering of the day ("September 3"), not the reader's clock,
 * which is why it arrives with the reading rather than being formatted here, and why a day
 * still loading shows a placeholder in its place.
 *
 * Set centred, like the title page of the book this is — the one block on the screen that is,
 * so the reading proper still begins flush left where a column of prose belongs. */
export const PrologueTitle = ({ date, children }) => (
    <header className="flex flex-col items-center gap-5 pt-6 text-center sm:pt-0">
        <CrossVine aria-hidden="true" className="h-16 w-auto" />

        {date ? (
            <h1 className="text-4xl font-bold tracking-tight text-reading">{date}</h1>
        ) : (
            <Skeleton className="h-10 w-56" />
        )}

        {children}
    </header>
)

/* Shaped to the real article — a date, a commemorations line, the fasting strip, then
 * alternating headings and paragraphs. Widths that disagree with what lands are what make
 * the page jump as it settles. */
export const PrologueSkeleton = () => (
    <div className="flex w-full max-w-2xl flex-col gap-10">
        <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-52" />
        </div>

        {[0, 1, 2].map((section) => (
            <div key={section} className="flex flex-col gap-4">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
            </div>
        ))}
    </div>
)

export const PrologueError = ({ message, onRetry }) => (
    <div className="flex w-full max-w-2xl flex-col items-start gap-4 py-16">
        <h2 className="text-xl font-medium">Today&rsquo;s reading didn&rsquo;t load</h2>
        <p className="text-base text-muted-foreground">
            {message || "Something went wrong reaching the reading."}
        </p>
        <Button variant="outline" onClick={onRetry}>Try again</Button>
    </div>
)

const Prologue = ({ day, className }) => {
    if (!day) return null

    return (
        <article
            className={cn(
                "flex w-full max-w-2xl flex-col gap-10 font-reading text-base leading-[1.85]",
                className,
            )}
        >
            <Fasting fasting={day.fasting} />

            {day.lives.map((life, index) => (
                <Section key={index} section={life} />
            ))}

            <Section section={day.hymn} label />
            <Section section={day.reflection} label />
            <Section section={day.contemplation} label />
            <Section section={day.homily} label />

            {day.footnotes.length > 0 && (
                <section className="flex flex-col gap-2 border-t border-border pt-6 text-sm text-muted-foreground">
                    {day.footnotes.map((note) => (
                        <p key={note.label}>
                            <sup className="text-reading font-medium">{note.label}</sup>{" "}
                            <Inline text={note.text} />
                        </p>
                    ))}
                </section>
            )}
        </article>
    )
}

export default Prologue
