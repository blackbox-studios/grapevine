import "server-only"

import { AppError, ERROR_CODES, notFound } from "@/lib/server/errors"
import { parsePrologue } from "@/lib/server/prologue/parse"

/* The Daily Read: one day's Prologue of Ohrid, and the fasting rule that goes with it.
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
 * The reading is the screen; the fasting rule is a strip at the top of it. So they fail
 * differently on purpose: the reading throws and the page shows an error, while orthocal
 * failing resolves to a null `fasting` and the page simply omits the strip. A devotional
 * reading must not be withheld because a second service is having a bad minute.
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

/* Keyed by month/day, because the reading for September 2nd is the same text every year. */
const readings = bounded(40)
/* Keyed by the full date, because Pascha moves and so does everything reckoned from it. */
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

/* The fasting rule and the liturgical day, from orthocal.info.
 *
 * Resolves to null on any failure — see the header. `abstain` is the field the screen is
 * actually built from: it names what is being kept from, which is both what the icons light
 * on and what the sentence lists, so no second "is it a fast" flag is derived here for the
 * two of them to disagree over. */
const loadObservance = async ({ year, month, day }) => {
    const key = `${year}-${month}-${day}`

    const cached = observances.get(key)
    if (cached !== undefined) return cached

    try {
        const response = await fetch(
            `${ORTHOCAL_BASE_URL}/gregorian/${year}/${month}/${day}/`,
            {
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                headers: { Accept: "application/json" },
            },
        )
        if (!response.ok) return null

        const data = await response.json()
        const observance = {
            title: data.titles?.[0] ?? null,
            tone: data.tone ?? null,
            level: data.fast_level_desc ?? null,
            abstain: data.fast_abstentions ?? [],
        }

        observances.set(key, observance)
        return observance
    } catch {
        /* Deliberately swallowed, and not cached: a timeout is a bad minute rather than a
         * fact about the day, and caching the null would keep the strip missing until the
         * process restarted. */
        return null
    }
}

/* One day of the Daily Read.
 *
 * `date` is an optional `YYYY-MM-DD`; absent means today. Both upstreams are asked at once,
 * because they are independent and the reading should not wait on the almanac. */
export const getDailyReading = async (date) => {
    const resolved = resolveDate(date)

    const [reading, fasting] = await Promise.all([
        loadReading(resolved),
        loadObservance(resolved),
    ])

    if (!reading) throw notFound("There is no reading for that day.")

    return {
        /* The date the reading was resolved for, echoed so a client that sent none can
         * label the screen without guessing at the server's clock. */
        on: `${resolved.year}-${String(resolved.month).padStart(2, "0")}-${String(resolved.day).padStart(2, "0")}`,
        ...reading,
        fasting,
    }
}
