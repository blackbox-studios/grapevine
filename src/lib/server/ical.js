import "server-only"

/* iCalendar (RFC 5545), reduced to the part a parish calendar actually uses.
 *
 * ── Why this file exists at all ──────────────────────────────────────────────
 *
 * A parish already keeps its calendar somewhere — for the Cathedral, a Google Calendar the
 * office has maintained for years. The obvious way to show it is Google's `<iframe>` embed,
 * and that was rejected for three reasons, in ascending order of importance: it looks like
 * Google rather than like Grapevine, it is unusable at phone width, and it is **opaque**. An
 * iframe is a sealed box, so the app cannot know that there is a Vespers on the 14th — which
 * makes a single compiled calendar, where a parish service and a sign-up slot sit on the same
 * day of the same grid, impossible. Reading the feed is what buys that.
 *
 * ── Why a parser and not a dependency ────────────────────────────────────────
 *
 * `ical.js` and `rrule` are both good and both would work. What they cost is a dependency
 * shipped for a file this app reads from exactly one place, and RFC 5545 is enormous next to
 * the slice a Google Calendar emits. The slice is written down below and is checked rather
 * than assumed: anything outside it is skipped rather than guessed at, so an unsupported rule
 * loses one event from the month instead of throwing the request away.
 *
 * ── The supported slice ──────────────────────────────────────────────────────
 *
 *   VEVENT           SUMMARY, DESCRIPTION, LOCATION, UID, STATUS, DTSTART, DTEND, DURATION
 *   date forms       floating, UTC (`…Z`), zoned (`TZID=`), and all-day (`VALUE=DATE`)
 *   RRULE            FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT, UNTIL,
 *                    BYDAY (incl. ordinals: `2SU`), BYMONTHDAY, BYMONTH
 *   EXDATE           the dates lifted out of a recurrence
 *   RECURRENCE-ID    one occurrence moved or re-titled, as its own VEVENT
 *
 * Not supported, deliberately: VTODO, VJOURNAL, VALARM, attendees, BYSETPOS, BYWEEKNO,
 * BYYEARDAY, and RDATE. None of them appears in a parish's calendar, and each would be
 * carried forever by whoever reads this next.
 *
 * ── Wall clock, then instant ─────────────────────────────────────────────────
 *
 * Recurrence is iterated in **wall-clock** terms and converted to an instant per occurrence,
 * never the other way round. "Every Sunday at 11:00" means eleven o'clock as the parish reads
 * a clock, and adding seven days to an instant walks an hour off on the day the clocks change.
 * That is the same reason `SignupSheet.timezone` exists — see its note in schema.prisma.
 */

/* ---------------------------------------------------------------------------
 * Time zones
 *
 * No library. `Intl.DateTimeFormat` already knows every IANA zone and every historical
 * daylight-saving rule the platform ships, which is the whole of what is needed here.
 * ------------------------------------------------------------------------- */

/* A zone's offset from UTC at one instant, in milliseconds.
 *
 * Formats the instant *in* the zone, reads the fields back as though they were UTC, and takes
 * the difference. It is the standard trick and it is exact, because `en-CA` + `hourCycle:
 * "h23"` pins the output to a fixed, parseable shape (`2026-06-07, 11:00:00`) in every engine
 * this runs on. */
const zoneOffset = (instantMs, timeZone) => {
    const parts = zoneFormatter(timeZone).formatToParts(new Date(instantMs))
    const at = (type) => Number(parts.find((part) => part.type === type)?.value)
    const asUtc = Date.UTC(
        at("year"),
        at("month") - 1,
        at("day"),
        at("hour") % 24,
        at("minute"),
        at("second"),
    )
    return asUtc - instantMs
}

/* One `Intl.DateTimeFormat` per zone, kept for the process. Constructing one is the expensive
 * part of the conversion above — measurably so, since expanding a year of a weekly event calls
 * it once per occurrence — and a calendar only ever names a handful of zones. */
const formatters = new Map()
const zoneFormatter = (timeZone) => {
    let formatter = formatters.get(timeZone)
    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        })
        formatters.set(timeZone, formatter)
    }
    return formatter
}

/* A wall-clock reading in some zone → the instant it names.
 *
 * `wallMs` is the naive local time encoded as though it were UTC, which is what
 * `Date.UTC(y, m, d, …)` produces and what the iterator below counts in.
 *
 * Two passes, and the second is not belt and braces. The offset has to be looked up *at* the
 * instant being computed, but that instant is what is being solved for — so the first pass
 * guesses with the offset at the wall time and the second corrects it. One correction is
 * enough for every real zone: the guess is at most an hour or two out, and a zone's offset is
 * constant over any such span except within the transition itself.
 *
 * **Inside a spring-forward gap the answer is the hour after**, and inside an autumn overlap it
 * is the first of the two. Both are the same choice every calendar makes, and neither can name
 * a service: nothing is scheduled for 02:30 on the morning the clocks move. */
export const zonedToInstant = (wallMs, timeZone) => {
    if (!timeZone || timeZone === "UTC") return wallMs
    try {
        const guess = wallMs - zoneOffset(wallMs, timeZone)
        return wallMs - zoneOffset(guess, timeZone)
    } catch {
        /* An unknown zone name. Reading it as UTC keeps the event on roughly the right day
         * rather than dropping it, which is the better failure for a calendar. */
        return wallMs
    }
}

/* The reverse: an instant → the wall clock it reads as in a zone, encoded the same way. Used
 * to bucket an event into a day, which is a question about clocks and not about instants. */
export const instantToZoned = (instantMs, timeZone) => {
    if (!timeZone || timeZone === "UTC") return instantMs
    try {
        return instantMs + zoneOffset(instantMs, timeZone)
    } catch {
        return instantMs
    }
}

/* ---------------------------------------------------------------------------
 * Parsing
 * ------------------------------------------------------------------------- */

/* Content lines, unfolded. A line longer than 75 octets is split and continued with a leading
 * space or tab, so a URL or a long summary arrives in pieces; joining them back is the first
 * thing any reader has to do, before a single property can be looked at. */
const contentLines = (text) => {
    const lines = []
    for (const raw of String(text).split(/\r\n|\n|\r/)) {
        if (/^[ \t]/.test(raw) && lines.length > 0) {
            lines[lines.length - 1] += raw.slice(1)
        } else {
            lines.push(raw)
        }
    }
    return lines
}

/* `NAME;PARAM=value;PARAM="quoted:value":the value` → `{ name, params, value }`.
 *
 * The split is at the first colon **outside quotes**, which is the one subtlety: a parameter
 * value may be quoted precisely so it can contain a colon, and `LOCATION` values routinely
 * contain them too. Splitting on the first colon found would cut a `TZID="…"` in half. */
const parseLine = (line) => {
    let quoted = false
    let colon = -1
    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') quoted = !quoted
        else if (char === ":" && !quoted) {
            colon = i
            break
        }
    }
    if (colon === -1) return null

    const head = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const [name, ...rest] = head.split(";")

    const params = {}
    for (const part of rest) {
        const eq = part.indexOf("=")
        if (eq === -1) continue
        params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, "")
    }

    return { name: name.toUpperCase(), params, value }
}

/* TEXT values are escaped per RFC 5545 §3.3.11: `\n` is a newline, and comma, semicolon and
 * backslash are escaped because they are the format's own separators. */
const unescapeText = (value) =>
    String(value)
        .replace(/\\n/gi, "\n")
        .replace(/\\([,;\\])/g, "$1")
        .trim()

/* A DATE or DATE-TIME value → `{ wallMs, tz, allDay }`.
 *
 * `wallMs` is the reading encoded as UTC-of-the-naive-fields, so the iterator can do arithmetic
 * on it without a zone in hand; `tz` is what turns it into an instant later. A trailing `Z`
 * means the value is already an instant, which is expressed here as a wall clock in UTC — the
 * same thing, and it keeps one representation through the whole file. */
const parseStamp = (value, params, calendarZone) => {
    const text = String(value).trim()

    const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(text)
    if (dateOnly || params.VALUE === "DATE") {
        const [, y, m, d] = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(text) ?? []
        if (!y) return null
        return { wallMs: Date.UTC(+y, +m - 1, +d), tz: "UTC", allDay: true }
    }

    const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(text)
    if (!dateTime) return null
    const [, y, m, d, h, mi, s, utc] = dateTime

    return {
        wallMs: Date.UTC(+y, +m - 1, +d, +h, +mi, +s),
        /* Precedence is the spec's: an explicit `Z` wins, then the value's own `TZID`, then
         * the calendar's `X-WR-TIMEZONE`. A value with none of the three is "floating" — it
         * means the same clock reading wherever it is read — and reading it in the calendar's
         * zone is the closest thing to that a single-zone display can offer. */
        tz: utc ? "UTC" : (params.TZID ?? calendarZone ?? "UTC"),
        allDay: false,
    }
}

/* `PT1H30M`, `P1D`, `P2DT4H` → milliseconds. Weeks and days only alongside time, which is the
 * whole of what a calendar emits; months and years are not durations a DTEND can be derived
 * from anyway, since neither has a fixed length. */
const parseDuration = (value) => {
    const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
        String(value).trim(),
    )
    if (!match) return null
    const [, sign, w, d, h, mi, s] = match
    const ms =
        (Number(w ?? 0) * 7 * 86400 + Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 +
            Number(mi ?? 0) * 60 + Number(s ?? 0)) * 1000
    return sign === "-" ? -ms : ms
}

/* `FREQ=WEEKLY;BYDAY=SU;UNTIL=20261231T235959Z` → an object with the parts this file honours.
 * Anything else in the rule is dropped rather than half-applied — an unsupported part usually
 * *narrows* a recurrence, so ignoring it would invent occurrences the parish never scheduled.
 * `supported` is what the expander checks before it emits anything. */
const WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

const parseRule = (value) => {
    const parts = {}
    for (const piece of String(value).split(";")) {
        const eq = piece.indexOf("=")
        if (eq === -1) continue
        parts[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1)
    }

    const freq = String(parts.FREQ ?? "").toUpperCase()
    if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null

    const byDay = (parts.BYDAY ?? "")
        .split(",")
        .map((token) => /^([+-]?\d+)?([A-Z]{2})$/.exec(token.trim().toUpperCase()))
        .filter((match) => match && match[2] in WEEKDAYS)
        .map((match) => ({ ordinal: match[1] ? Number(match[1]) : 0, day: WEEKDAYS[match[2]] }))

    const until = parts.UNTIL ? parseStamp(parts.UNTIL, {}, "UTC") : null

    return {
        freq,
        interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
        count: parts.COUNT ? Number(parts.COUNT) : null,
        /* UNTIL is an instant in the spec (it carries a `Z`), and a date-only UNTIL is
         * compared as the start of that day, which is what every other reader does. */
        until: until ? until.wallMs : null,
        byDay,
        byMonthDay: (parts.BYMONTHDAY ?? "")
            .split(",")
            .map((n) => Number(n.trim()))
            .filter((n) => Number.isInteger(n) && n !== 0),
        byMonth: (parts.BYMONTH ?? "")
            .split(",")
            .map((n) => Number(n.trim()))
            .filter((n) => n >= 1 && n <= 12),
        /* BYSETPOS and the rest are the parts that would change which occurrences come out.
         * A rule carrying one is expanded as its own single first occurrence instead — the
         * event still appears on the day it starts, and no invented dates follow it. */
        supported: !("BYSETPOS" in parts || "BYWEEKNO" in parts || "BYYEARDAY" in parts),
    }
}

/* Every VEVENT in a calendar, unexpanded.
 *
 * Overrides (a VEVENT carrying RECURRENCE-ID) come back in the same list and are separated by
 * `expandCalendar`, which is the only thing that can tell which series they belong to. */
export const parseCalendar = (text) => {
    const events = []
    let calendarZone = "UTC"
    let event = null

    for (const line of contentLines(text)) {
        const parsed = parseLine(line)
        if (!parsed) continue
        const { name, params, value } = parsed

        if (name === "BEGIN" && value === "VEVENT") {
            event = { exdates: [] }
            continue
        }
        if (name === "END" && value === "VEVENT") {
            if (event?.start) events.push(event)
            event = null
            continue
        }

        if (!event) {
            /* Google names the calendar's own zone here, and it is what a floating value is
             * read in. Outside a VEVENT so it cannot be shadowed by one. */
            if (name === "X-WR-TIMEZONE") calendarZone = value.trim() || "UTC"
            continue
        }

        switch (name) {
            case "UID":
                event.uid = value.trim()
                break
            case "SUMMARY":
                event.summary = unescapeText(value)
                break
            case "DESCRIPTION":
                event.description = unescapeText(value)
                break
            case "LOCATION":
                event.location = unescapeText(value)
                break
            case "STATUS":
                event.status = value.trim().toUpperCase()
                break
            case "DTSTART":
                event.start = parseStamp(value, params, calendarZone)
                break
            case "DTEND":
                event.end = parseStamp(value, params, calendarZone)
                break
            case "DURATION":
                event.duration = parseDuration(value)
                break
            case "RRULE":
                event.rule = parseRule(value)
                break
            case "RECURRENCE-ID":
                event.recurrenceId = parseStamp(value, params, calendarZone)
                break
            case "EXDATE":
                for (const piece of value.split(",")) {
                    const stamp = parseStamp(piece, params, calendarZone)
                    if (stamp) event.exdates.push(stamp.wallMs)
                }
                break
            default:
                break
        }
    }

    return { events, calendarZone }
}

/* ---------------------------------------------------------------------------
 * Expansion
 * ------------------------------------------------------------------------- */

/* How long one occurrence lasts, in milliseconds of wall clock.
 *
 * Taken from the *first* occurrence and applied to the rest, which is what the spec says and
 * is also the only thing that survives a daylight-saving change sensibly: a Liturgy that runs
 * ninety minutes runs ninety minutes on the Sunday the clocks go back too. */
const durationOf = (event) => {
    if (Number.isFinite(event.duration)) return event.duration
    if (event.end) return event.end.wallMs - event.start.wallMs
    /* No DTEND and no DURATION: an all-day event is one day, and a timed one is a point. */
    return event.start.allDay ? 86400000 : 0
}

/* Wall-clock arithmetic on the encoded form. Working in UTC getters/setters is what makes this
 * safe — the value carries no zone, so nothing here can drift across a transition. */
const addDays = (wallMs, days) => wallMs + days * 86400000
const addMonths = (wallMs, months) => {
    const date = new Date(wallMs)
    const day = date.getUTCDate()
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() + months)
    /* A 31st rolled into a short month would otherwise land in the next one. Clamping is what
     * every calendar does with "monthly on the 31st" in February: the occurrence is skipped,
     * which `startOfDay(day) === day` below detects. */
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(day, lastDay))
    return date.getTime()
}

/* The nth weekday of the month containing `wallMs` — `2SU` is the second Sunday, `-1SU` the
 * last. Returns null when the month has no such day (a fifth Sunday in a short month). */
const nthWeekday = (wallMs, ordinal, weekday, hours) => {
    const date = new Date(wallMs)
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()

    const days = []
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    for (let day = 1; day <= last; day++) {
        const candidate = Date.UTC(year, month, day)
        if (new Date(candidate).getUTCDay() === weekday) days.push(day)
    }

    const picked = ordinal > 0 ? days[ordinal - 1] : days[days.length + ordinal]
    if (!picked) return null
    return Date.UTC(year, month, picked) + hours
}

/* A hard ceiling on how many times a rule is stepped. Reached only by a daily event that
 * started decades before the window being asked for — 20 000 daily steps is 54 years — and it
 * exists so a malformed or hostile feed cannot spin the request instead of answering it. */
const MAX_STEPS = 20000

/* Every occurrence of one event whose start falls in `[from, to)`, as instants.
 *
 * Iteration begins at DTSTART rather than at `from`, and that is not laziness: COUNT is a
 * count from the beginning of the series, so a rule capped at ten occurrences cannot be
 * resolved from the middle. The steps are integer arithmetic on a number, so a decade of them
 * costs less than the network round trip that fetched the feed. */
const occurrencesOf = (event, from, to) => {
    const { start, rule } = event
    const zone = start.tz
    const length = durationOf(event)
    const exdates = new Set(event.exdates)

    const emit = (wallMs) => {
        const startsAt = zonedToInstant(wallMs, zone)
        return {
            wallMs,
            startsAt,
            endsAt: zonedToInstant(wallMs + length, zone),
        }
    }

    const first = emit(start.wallMs)
    if (!rule || !rule.supported) {
        return first.startsAt < to && first.endsAt > from ? [first] : []
    }

    const out = []
    const hours = start.wallMs - Date.UTC(
        new Date(start.wallMs).getUTCFullYear(),
        new Date(start.wallMs).getUTCMonth(),
        new Date(start.wallMs).getUTCDate(),
    )

    let emitted = 0
    let steps = 0
    let cursor = start.wallMs

    /* One "step" is one turn of the rule's period, which for a weekly rule with several BYDAYs
     * yields more than one occurrence — hence the inner list. Occurrences come out of a step in
     * ascending order, which is what lets the loop stop at the first one past the window. */
    const candidatesAt = (wallMs) => {
        switch (rule.freq) {
            case "DAILY":
                return [wallMs]
            case "WEEKLY": {
                if (rule.byDay.length === 0) return [wallMs]
                /* The week's Sunday, then each named weekday off it. `WKST` is ignored: it only
                 * changes which day a week is considered to begin on, which matters for
                 * INTERVAL > 1 and for BYWEEKNO, and a fortnightly parish meeting is rare
                 * enough that being a week out on it is better than a week of extra code. */
                const sunday = addDays(wallMs, -new Date(wallMs).getUTCDay())
                return rule.byDay.map(({ day }) => addDays(sunday, day)).sort((a, b) => a - b)
            }
            case "MONTHLY": {
                if (rule.byDay.length > 0) {
                    return rule.byDay
                        .map(({ ordinal, day }) => nthWeekday(wallMs, ordinal || 1, day, hours))
                        .filter(Boolean)
                        .sort((a, b) => a - b)
                }
                if (rule.byMonthDay.length > 0) {
                    const date = new Date(wallMs)
                    const last = new Date(
                        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
                    ).getUTCDate()
                    return rule.byMonthDay
                        .map((day) => (day > 0 ? day : last + day + 1))
                        .filter((day) => day >= 1 && day <= last)
                        .map((day) =>
                            Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day) + hours,
                        )
                        .sort((a, b) => a - b)
                }
                return [wallMs]
            }
            case "YEARLY":
                return [wallMs]
            default:
                return []
        }
    }

    while (steps < MAX_STEPS) {
        steps += 1

        for (const candidate of candidatesAt(cursor)) {
            /* A candidate before DTSTART is an artefact of snapping to the start of a week or
             * a month, not an occurrence — the series begins at DTSTART. */
            if (candidate < start.wallMs) continue
            if (rule.until !== null && zonedToInstant(candidate, zone) > rule.until) {
                return out
            }
            if (rule.count !== null && emitted >= rule.count) return out
            emitted += 1
            if (exdates.has(candidate)) continue

            const occurrence = emit(candidate)
            if (occurrence.startsAt >= to) return out
            if (occurrence.endsAt > from) out.push(occurrence)
        }

        /* Past the window and no further occurrence can come back into it. Checked after the
         * step rather than inside it so a monthly rule whose first candidate of the month is
         * out of range still gets to try the rest. */
        if (zonedToInstant(cursor, zone) >= to) return out

        switch (rule.freq) {
            case "DAILY":
                cursor = addDays(cursor, rule.interval)
                break
            case "WEEKLY":
                cursor = addDays(cursor, 7 * rule.interval)
                break
            case "MONTHLY":
                cursor = addMonths(cursor, rule.interval)
                break
            case "YEARLY":
                cursor = addMonths(cursor, 12 * rule.interval)
                break
            default:
                return out
        }
    }

    return out
}

/* A calendar's text and a window → the events in it, flattened, sorted, and capped.
 *
 * ── Overrides ────────────────────────────────────────────────────────────────
 *
 * A moved or re-titled occurrence arrives as a second VEVENT with the same UID and a
 * RECURRENCE-ID naming the occurrence it replaces. So the series is expanded first, the
 * occurrence matching that RECURRENCE-ID is dropped, and the override is emitted in its place
 * — which is how "Vespers is at 5 this week" reaches the reader as one event rather than two.
 * A cancelled override (`STATUS:CANCELLED`) removes the occurrence and puts nothing back,
 * which is the other half of the same mechanism. */
export const expandCalendar = (text, { from, to, limit = 500 } = {}) => {
    const { events } = parseCalendar(text)

    const overrides = new Map()
    for (const event of events) {
        if (!event.recurrenceId) continue
        const key = `${event.uid}:${event.recurrenceId.wallMs}`
        overrides.set(key, event)
    }

    const fromMs = from instanceof Date ? from.getTime() : Number(from)
    const toMs = to instanceof Date ? to.getTime() : Number(to)

    const out = []

    const push = (event, occurrence) => {
        out.push({
            uid: event.uid ?? null,
            title: event.summary || "Untitled",
            description: event.description ?? null,
            location: event.location ?? null,
            allDay: Boolean(event.start.allDay),
            startsAt: new Date(occurrence.startsAt),
            endsAt: new Date(occurrence.endsAt),
        })
    }

    for (const event of events) {
        if (event.recurrenceId) continue
        if (event.status === "CANCELLED") continue

        for (const occurrence of occurrencesOf(event, fromMs, toMs)) {
            const override = overrides.get(`${event.uid}:${occurrence.wallMs}`)
            if (override) continue
            push(event, occurrence)
        }
    }

    /* The overrides themselves, each expanded as the single event it is — it may have been
     * moved outside the window, or into one it would not otherwise appear in. */
    for (const override of overrides.values()) {
        if (override.status === "CANCELLED") continue
        for (const occurrence of occurrencesOf({ ...override, rule: null }, fromMs, toMs)) {
            push(override, occurrence)
        }
    }

    out.sort((a, b) => a.startsAt - b.startsAt || a.title.localeCompare(b.title))
    return out.slice(0, limit)
}
