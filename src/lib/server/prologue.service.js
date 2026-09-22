import "server-only"

import { DEFAULT_TRANSLATION, READING_TRANSLATIONS } from "@/lib/constants"
import { AppError, ERROR_CODES, notFound } from "@/lib/server/errors"
import { parsePrologue } from "@/lib/server/prologue/parse"

/* The Daily Read: one day's Prologue of Ohrid, with the scripture appointed for that day and
 * the fasting rule that goes with it.
 *
 * ── Why this fetches instead of shipping the text ───────────────────────────
 *
 * The reading comes from github.com/jaredef/ochrid, whose content tree is one MDX file per
 * day. That corpus is CC BY-NC 4.0 and its own README states the underlying translation is
 * third-party copyrighted material carried under a fair-use claim. Fetching it per request
 * keeps a copy of somebody else's licensed corpus out of this repo and its history, and lets
 * upstream's ongoing typo corrections arrive without a sync step. The cost is an external
 * dependency on a read path, which the cache below is sized to absorb.
 *
 * ── The two sources are not equals ──────────────────────────────────────────
 *
 * The Prologue is the screen; the scripture and the fasting rule are what sits above it. So
 * they fail differently on purpose: the Prologue throws and the page shows an error, while
 * orthocal failing resolves to a null `fasting` and no `readings`, and the page simply omits
 * both. A devotional reading must not be withheld because a second service is having a bad
 * minute.
 *
 * ── New calendar ────────────────────────────────────────────────────────────
 *
 * The Prologue's days are keyed to the civil date here, matching what ochrid.org serves at
 * /september/2nd on September 2nd, and the fasting rule is asked of orthocal's `gregorian`
 * endpoint to agree with it. Old-calendar readers want the Julian reckoning — the same file
 * thirteen days back, against orthocal's `julian` endpoint — which is a parameter this
 * resolver would grow rather than a second code path. */

const SOURCE_BASE_URL =
    process.env.PROLOGUE_SOURCE_BASE_URL ??
    "https://raw.githubusercontent.com/jaredef/ochrid/main/content"

const ORTHOCAL_BASE_URL =
    process.env.ORTHOCAL_BASE_URL ?? "https://orthocal.info/api"

/* The translation is the reader's, set on `/settings/general` and sent per request. It is
 * always named in the query rather than left to upstream's own default, because that default
 * is upstream's to change.
 *
 * Validated against the same list the setting is drawn from: orthocal answers 422 to anything
 * outside it, and a 422 from a third party is not what a reader should be shown for having a
 * stale preference in a store. An unrecognised value reads as none at all. */
const TRANSLATIONS = new Set(READING_TRANSLATIONS.map(({ value }) => value))

const resolveTranslation = (value) =>
    TRANSLATIONS.has(value) ? value : DEFAULT_TRANSLATION

/* Upstream is a static file host and an almanac, so a slow response is a failure rather
 * than something to wait out — the reader is looking at a skeleton the whole time. */
const FETCH_TIMEOUT_MS = 8_000

const MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]

/* The corpus names its files by ordinal — `september/2nd.mdx`. Written out rather than
 * formatted with date-fns because the input here is already a bare year/month/day triple,
 * and putting it through a Date only to read it back is where a timezone would get in. */
const ordinal = (day) => {
    const teen = day % 100
    if (teen >= 11 && teen <= 13) return `${day}th`
    switch (day % 10) {
        case 1: return `${day}st`
        case 2: return `${day}nd`
        case 3: return `${day}rd`
        default: return `${day}th`
    }
}

/* A bounded cache. The reading for a given calendar day never changes within a deployment,
 * so entries are kept rather than expired; the cap is what stops a long-lived server from
 * holding the whole year's parsed text at once, and eviction is oldest-first because the
 * days being asked for advance in one direction. */
const bounded = (limit) => {
    const entries = new Map()
    return {
        get: (key) => entries.get(key),
        set: (key, value) => {
            if (entries.size >= limit) entries.delete(entries.keys().next().value)
            entries.set(key, value)
        },
    }
}

/* Keyed by month/day, because the Prologue's entry for September 2nd is the same text every
 * year. */
const readings = bounded(40)

/* The day from orthocal, keyed by the full date because Pascha moves and so does everything
 * reckoned from it. One entry holds `{ fasting, scripture }`, where `scripture` is keyed by
 * translation.
 *
 * **The nesting is what keeps the two readers from paying for each other.** The fasting rule is
 * a fact about the date and is identical in every translation, so a sign-up sheet showing it
 * must not miss the cache because the reader of the Daily Read happens to be on the Douay. Only
 * the scripture is per-translation, and only a translation nobody has asked for yet costs a
 * fetch. */
const observances = bounded(40)

/* Validates a `YYYY-MM-DD` param and falls back to the server's own date.
 *
 * The client sends its local date rather than letting the server decide, because "today's
 * reading" means today where the reader is standing — a parish in California opening the
 * app at 9pm should not be reading tomorrow's entry off a UTC server. The round trip
 * through `Date` is what rejects the impossible days a regex would pass, such as
 * 2026-02-31. */
export const resolveDate = (value) => {
    if (!value) {
        const now = new Date()
        return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) {
        throw new AppError(
            ERROR_CODES.VALIDATION_FAILED,
            "date must be in YYYY-MM-DD form.",
            { fields: { date: "Expected YYYY-MM-DD." } },
        )
    }

    const [, year, month, day] = match.map(Number)
    const probe = new Date(Date.UTC(year, month - 1, day))
    if (
        probe.getUTCFullYear() !== year ||
        probe.getUTCMonth() + 1 !== month ||
        probe.getUTCDate() !== day
    ) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, "That date does not exist.", {
            fields: { date: "Not a real date." },
        })
    }

    return { year, month, day }
}

/* A resolved triple back to the `YYYY-MM-DD` it was read from, which is what both readers echo. */
const isoDate = ({ year, month, day }) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`

const fetchText = async (url) => {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "text/plain" },
    })
    if (!response.ok) {
        throw new AppError(
            response.status === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.UNAVAILABLE,
            response.status === 404
                ? "There is no reading for that day."
                : "The daily reading is unavailable right now. Please try again.",
        )
    }
    return response.text()
}

/* The day's reading, parsed. February 29th exists in the corpus, so no year is involved. */
const loadReading = async ({ month, day }) => {
    const key = `${MONTHS[month - 1]}/${ordinal(day)}`

    const cached = readings.get(key)
    if (cached) return cached

    const mdx = await fetchText(`${SOURCE_BASE_URL}/${key}.mdx`)

    let reading
    try {
        reading = parsePrologue(mdx)
    } catch {
        /* The parser only throws on a document with no sections, which means the fetch
         * succeeded and returned something that is not a day of the Prologue. That is
         * upstream changing shape, not the reader doing anything wrong. */
        throw new AppError(
            ERROR_CODES.UNAVAILABLE,
            "The daily reading could not be read. Please try again later.",
        )
    }

    readings.set(key, reading)
    return reading
}

/* The scripture a parish means by "today's readings".
 *
 * orthocal lists the day's whole cycle — the eve's Vespers readings, a Matins gospel, then the
 * epistles and the gospels — and a Sunday carrying a feast runs to ten of them, which is more
 * scripture than the Prologue entry it would sit above. The Liturgy's readings are the ones
 * heard, and a feast on a Sunday genuinely appoints several of each, so this filters rather
 * than picking two.
 *
 * The fallback is the case that matters rather than a nicety: a weekday of Great Lent has no
 * Liturgy and therefore no epistle or gospel at all, only Genesis, Proverbs and Isaiah at
 * Vespers and the Sixth Hour. Falling back to whatever the day does appoint is what keeps the
 * scripture from disappearing over the forty days a parish is reading most. */
const LITURGY_SOURCES = new Set(["Epistle", "Gospel"])

/* orthocal separates chapter from verse with a full stop — "Mark 6.7-13" — which reads as a
 * decimal rather than as a reference, and turns the span across a chapter boundary into
 * nonsense: "Isaiah 9.9-10.4" is chapter 9 verse 9 through chapter 10 verse 4, not a range
 * between two numbers. The colon is how a reference is written and how anybody reading along
 * in their own Bible will look it up. Digit-bounded so nothing else in the string is touched,
 * such as the alternate numbering in "3[1] Kings 8.22-23, 27-30". */
const referenced = (display) => display?.replace(/(\d)\.(\d)/g, "$1:$2") ?? null

const projectReadings = (appointed = []) => {
    const liturgy = appointed.filter((reading) => LITURGY_SOURCES.has(reading.source))

    return (liturgy.length ? liturgy : appointed)
        .map((reading) => ({
            source: reading.source,
            reference: referenced(reading.display),
            /* Why this one is read today ("Sunday before Elevation", "Church"), and the only
             * thing on the screen answering why there are three epistles. Usually empty. */
            occasion: reading.description || null,
            verses: (reading.passage ?? []).map((verse) => ({
                chapter: verse.chapter,
                verse: verse.verse,
                text: verse.content,
                /* The only structure a passage has. Ninety verses set as one block is a wall. */
                paragraph: Boolean(verse.paragraph_start),
            })),
        }))
        .filter((reading) => reading.verses.length > 0)
}

/* The liturgical day from orthocal.info: what the Church keeps, and what it reads.
 *
 * Resolves to null on any failure — see the header. `abstain` is the field the fasting strip is
 * actually built from: it names what is being kept from, which is both what the icons light
 * on and what the sentence lists, so no second "is it a fast" flag is derived here for the
 * two of them to disagree over.
 *
 * Both halves arrive in one response, so both are kept — `{ fasting, scripture }`, the second
 * keyed by translation. A day already held in another translation is re-fetched for the
 * scripture and keeps the rule it already had. */
const observanceKey = ({ year, month, day }) => `${year}-${month}-${day}`

const loadObservance = async (resolved, translation) => {
    const { year, month, day } = resolved
    const key = observanceKey(resolved)

    const cached = observances.get(key)
    if (cached?.scripture[translation]) return cached

    try {
        const response = await fetch(
            `${ORTHOCAL_BASE_URL}/gregorian/${year}/${month}/${day}/?translation=${translation}`,
            {
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                headers: { Accept: "application/json" },
            },
        )
        if (!response.ok) return cached ?? null

        const data = await response.json()
        const observance = {
            fasting: {
                title: data.titles?.[0] ?? null,
                tone: data.tone ?? null,
                level: data.fast_level_desc ?? null,
                abstain: data.fast_abstentions ?? [],
            },
            scripture: {
                ...cached?.scripture,
                [translation]: projectReadings(data.readings),
            },
        }

        observances.set(key, observance)
        return observance
    } catch {
        /* Deliberately swallowed, and nothing new is cached: a timeout is a bad minute rather
         * than a fact about the day, and remembering the failure would keep the strip missing
         * until the process restarted. Whatever was already held still stands. */
        return cached ?? null
    }
}

/* The fasting rule for one date, without the reading.
 *
 * The Daily Read is not the only surface that wants this: a sign-up sheet for the kitchen shows
 * whoever is taking a date what the Church keeps on it (`SignupSheet.showFasting`), and somebody
 * signing up for four Sundays in a row would otherwise pull down four days of somebody else's
 * licensed corpus to read a five-word sentence. So the almanac half is reachable on its own, and
 * both callers share `observances` above — a date warmed by one is free for the other.
 *
 * **Any translation satisfies this**, which is why the cache is consulted before the loader
 * rather than through it: the rule is a fact about the date, so a date already read in any
 * English answers here without a request. Only a date nobody has opened at all costs one, and
 * it is spent on the default translation because this caller has no reader to ask.
 *
 * Null `fasting` is the ordinary answer when orthocal cannot be reached, exactly as it is on the
 * reading: the surface omits the strip rather than failing. */
export const getFastingRule = async (date) => {
    const resolved = resolveDate(date)
    const observance =
        observances.get(observanceKey(resolved)) ??
        (await loadObservance(resolved, DEFAULT_TRANSLATION))

    return {
        on: isoDate(resolved),
        fasting: observance?.fasting ?? null,
    }
}

/* One day of the Daily Read.
 *
 * `date` is an optional `YYYY-MM-DD`; absent means today. `translation` is the reader's
 * preference and falls back to the default when absent or unrecognised. Both upstreams are
 * asked at once, because they are independent and the Prologue should not wait on the almanac.
 *
 * A day whose scripture could not be fetched in this translation still renders: `readings` is
 * empty and the Prologue below it is untouched. */
export const getDailyReading = async (date, translation) => {
    const resolved = resolveDate(date)
    const version = resolveTranslation(translation)

    const [reading, observance] = await Promise.all([
        loadReading(resolved),
        loadObservance(resolved, version),
    ])

    if (!reading) throw notFound("There is no reading for that day.")

    return {
        /* The date the reading was resolved for, echoed so a client that sent none can
         * label the screen without guessing at the server's clock. */
        on: isoDate(resolved),
        ...reading,
        fasting: observance?.fasting ?? null,
        readings: observance?.scripture[version] ?? [],
    }
}
