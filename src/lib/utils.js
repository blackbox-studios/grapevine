import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

import {
    API_BASE,
    FULL_BLEED_ROUTES,
    MONTHS,
    NESTED_TRANSITION_ROUTES,
    ROUTES,
    RUNTIME_ROUTES,
    SILENT_ERROR_CODES,
} from "@/lib/constants"

/* Custom classes */
const twMerge = extendTailwindMerge({
    extend: {
        theme: {
            color: ["success", "warning", "link"],
        },
        classGroups: {
            "font-size": [{ text: ["xxs", "button"] }],
        },
    },
})

export function cn(...inputs) {
    return twMerge(clsx(inputs))
}

/* Normalizes anything a store action can catch into the string list `useErrorListener`
 * expects (see frontend-architecture.md → Error Handling).
 *
 * Only an `ApiError` contributes its own `message`, because the API contract guarantees that
 * message is a single sentence written to be shown to a user. Anything else reaching here is
 * a bug in our own code — a TypeError, a non-Error throw — and its message is an internal
 * string, so the caller's copy is used instead.
 *
 * **`false` for a silent code**, which is the same value every store's `ERROR_INIT` uses for
 * "nothing is wrong" — so a refusal nobody is meant to hear about raises no toast *and* leaves
 * no error state for a surface to render. `SILENT_ERROR_CODES` is the list, and it exists here
 * rather than in `useErrorListener` because the rule is about what an error *is*, not about one
 * of the ways it might be shown: a store that grew an inline error banner tomorrow would
 * otherwise have to learn the rule again.
 *
 * Stores should still branch on `error.code` when the *behaviour* differs — a 404 the UI
 * already renders as an empty state shouldn't also toast. This only formats the message. */
export const toErrorList = (error, fallback) => {
    if (SILENT_ERROR_CODES.has(error?.code)) return false

    const trusted = error?.name === "ApiError" && typeof error.message === "string"
    return [trusted && error.message.length > 0 ? error.message : fallback]
}

export function statusDotClasses(tone) {
    const STATUS_DOT_TONES = {
        success: "bg-success border border-success",
        warning: "bg-warning border border-warning",
        destructive: "bg-destructive border border-destructive",
        muted: "border border-muted-foreground/40",
        "success-outline": "border border-success bg-background",
    }
    return STATUS_DOT_TONES[tone] ?? STATUS_DOT_TONES.muted
}

export const transition = (reduceMotion = false, duration = 0.3, delay = 0) => {
    if (reduceMotion) return {}
    return {
        initial: { opacity: 0.01 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { ease: "easeInOut", duration, delay },
    }
}

export function formatTimestamp(iso) {
    const d = new Date(iso)
    const p = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    })
}

/* Day-granular relative time — "Today", "a week ago", etc. */
export function timeAgoMacro(current, previous) {
    const msPerDay = 24 * 60 * 60 * 1000
    const elapsed = current - previous

    if (elapsed < msPerDay) return "Today"

    const days = Math.floor(elapsed / msPerDay)

    if (days === 1) return "Yesterday"
    if (days < 7) return `${days} days ago`
    if (days < 14) return "a week ago"
    if (days < 30) {
        const weeks = Math.floor(days / 7)
        return weeks === 1 ? "a week ago" : `${weeks} weeks ago`
    }
    if (days < 60) return "a month ago"
    if (days < 365) {
        const months = Math.floor(days / 30)
        return months === 1 ? "a month ago" : `${months} months ago`
    }
    if (days < 730) return "a year ago"
    const years = Math.floor(days / 365)
    return years === 1 ? "a year ago" : `${years} years ago`
}

export function timeAgo(current, previous) {
    const msPerMinute = 60 * 1000
    const msPerHour = msPerMinute * 60
    const msPerDay = msPerHour * 24
    const msPerMonth = msPerDay * 30
    const msPerYear = msPerDay * 365

    const elapsed = current - previous

    if (elapsed < msPerMinute) return `${Math.round(elapsed / 1000)} s ago`
    if (elapsed < msPerHour) return `${Math.round(elapsed / msPerMinute)} min ago`
    if (elapsed < msPerDay) return `${Math.round(elapsed / msPerHour)} hr ago`
    if (elapsed < msPerMonth) return `${Math.round(elapsed / msPerDay)} d ago`
    if (elapsed < msPerYear) return `${Math.round(elapsed / msPerMonth)} mo ago`
    return `${Math.round(elapsed / msPerYear)} yr ago`
}

/* Compact, Instagram-style relative time from a timestamp: "now", "5m", "9h",
 * "2d", "3w", "5mo", "2y". `current`/`previous` are epoch ms (pass now from
 * useNow() so it stays pure across renders and refreshes on the minute). */
export function timeAgoCompact(current, previous) {
    const seconds = Math.max(0, Math.floor((current - previous) / 1000))
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    const weeks = Math.floor(days / 7)
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)

    if (seconds < 60) return "now"
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    if (weeks < 5) return `${weeks}w`
    if (months < 12) return `${months}mo`
    return `${years}y`
}

/* Runs something on the browser's next idle moment, answering the cancel for it.
 *
 * WKWebView only gained `requestIdleCallback` in iOS 16.4 and the packaged app still runs on
 * earlier ones, so a timer stands in for it there. Both say the same thing to a caller: after
 * the screen the reader is actually looking at has settled. */
export const whenIdle = (run, { timeout = 3000, delay = 1500 } = {}) => {
    const idle = typeof requestIdleCallback === "function"
    const handle = idle ? requestIdleCallback(run, { timeout }) : setTimeout(run, delay)
    return () => (idle ? cancelIdleCallback(handle) : clearTimeout(handle))
}

/* The app's base path with any trailing slash stripped: "" in host dev, otherwise
 * the configured NEXT_PUBLIC_BASE_PATH (kept in sync with basePath in next.config). */
export const basePath = () => (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')

/* Prefix a router route with the base path so redirects that bypass the router
 * still resolve when the SPA is served under a subpath.
 *
 * An absolute URL passes through untouched. Uploaded media lives in Supabase Storage and is
 * addressed by its full https:// URL, while the seeded corpus is root-relative — both go
 * through the same `<img src={appPath(...)}>`, and prefixing the first would produce
 * "/app/https://…". Protocol-relative ("//host/…") counts as absolute for the same reason. */
export const appPath = (route) =>
    /^([a-z][a-z0-9+.-]*:)?\/\//i.test(route) ? route : `${basePath()}${route}`

/* The deep-link route for a single post's detail page (`/p/:id`). Built off
 * ROUTES.POST so the path prefix lives in one place. */
export const postPath = (id) => `${ROUTES.POST}/${id}`

/* One sign-up sheet's URL. A real, shareable one — see `ROUTES.SIGNUP`. */
export const signupPath = (id) => `${ROUTES.SIGNUP}/${id}`


/* "03-09" → "9 March". A name day has no year, so nothing here invents one.
 *
 * Spelled out from `MONTHS` rather than through `toLocaleDateString`, for the reason
 * `DatePicker` formats its own dates that way: the app prerenders to static HTML, and a
 * locale-formatted date is one of the few things that reliably differs between the build
 * machine and the reader's browser. */
export const formatNameDay = (value, { short = false } = {}) => {
    const match = /^(\d{2})-(\d{2})$/.exec(value ?? "")
    if (!match) return ""
    const month = MONTHS[Number(match[1]) - 1]
    return `${Number(match[2])} ${short ? month.slice(0, 3) : month}`
}

/* "2011-06-12" → "12 Jun 2011". The short form, for a place that has one line to say a whole
 * date in — a row of the profile card's info list. `formatDate` is the long one, for prose. */
export const formatDateCompact = (iso) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "")
    if (!match) return ""
    return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1].slice(0, 3)} ${match[1]}`
}

/* Today, as `YYYY-MM-DD`, in the reader's own timezone.
 *
 * Built from the local getters rather than `toISOString`, which converts to UTC first: for
 * a reader west of Greenwich after 4pm that returns tomorrow's date, so the Daily Read
 * would turn over an evening early. */
export const todayLocal = () => {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `${now.getFullYear()}-${month}-${day}`
}

/* "2026-09-02" + 1 → "2026-09-03", rolling months and leap years the way the calendar does.
 *
 * The arithmetic runs in UTC even though the input came from a local clock, because it is a
 * *date* being stepped rather than an instant: local-time maths across a daylight-saving
 * boundary lands on 23:00 the previous day and rounds back to where it started. */
export const addDays = (iso, days) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "")
    if (!match) return ""

    const [, year, month, day] = match.map(Number)
    const shifted = new Date(Date.UTC(year, month - 1, day + days))

    return [
        shifted.getUTCFullYear(),
        String(shifted.getUTCMonth() + 1).padStart(2, "0"),
        String(shifted.getUTCDate()).padStart(2, "0"),
    ].join("-")
}

/* A post's photos, as one array of URLs whatever the wire shape.
 *
 * `projectMedia` sends `image` + `width`/`height` for a single photo and `images` for a
 * carousel, so every surface that renders media had its own copy of this two-branch read —
 * and an empty result is not a detail: it is what makes a post a text post, which the feed
 * card and <PostView/> now both decide their whole layout on. One answer, in one place. */
export const postImages = (post) => post?.images ?? (post?.image ? [post.image] : [])

/* The box a post's photos are drawn in, as a CSS aspect ratio.
 *
 * One number for the whole post rather than one per photo: a carousel lays its slides side by
 * side and pages through them, so a shape per slide would be a height per slide and the card
 * would change height under the finger. The first photo decides it and the rest are contained
 * inside it, which is Instagram's rule too. A post carrying no dimensions answers 1, the
 * square a carousel with nothing to go on is drawn as. */
export const mediaRatio = (post) =>
    post?.width && post?.height ? post.width / post.height : 1

/* ---------------------------------------------------------------------------
 * YouTube
 *
 * Shared by both sides for the reason the calendar helpers below are: the composer refuses a
 * link the server would refuse, at the keystroke rather than three taps later, because it is
 * the same function deciding.
 *
 * **The id is the record and the URL is rebuilt from it.** Everything a post carries about a
 * video is derived here from eleven characters, so nothing a person pasted is ever stored, put
 * into an `src`, or rendered. That is what stands in for the `isOwnedUrl` check every other
 * kind of post media passes (see `createPost`): an upload is trusted because it landed in a
 * folder this group's own grant created, and a video is trusted because the only thing kept
 * from the address bar is an id that cannot express anything but a video.
 * ------------------------------------------------------------------------- */

/* Every shape of YouTube address a person could plausibly paste, and the id in it.
 *
 * Six forms, because the one somebody has to hand depends entirely on where they got it: the
 * watch page is what a desktop browser shows, `youtu.be` is what the Share button copies,
 * `/shorts` and `/live` are what a phone lands on, `/embed` is what somebody who found the
 * "copy embed code" button will have, and `/v/` is what a decade-old parish website links to.
 * Accepting all six is the difference between a feature that works and one that is technically
 * correct — the same argument `icsFeedUrl` makes below.
 *
 * Ids are exactly eleven characters of URL-safe base64 and have been since the beginning, so
 * the shape is worth asserting: it is what makes this a parser rather than a way to put an
 * arbitrary string into an iframe's `src`. A pasted link carrying a playlist, a timestamp or a
 * tracking parameter loses them, which is deliberate — a post links to a video, and `?t=90` on
 * a parish's feast day recording is somebody's scroll position rather than the parish's. */
const YOUTUBE_ID = /^[\w-]{11}$/

export const youtubeId = (input) => {
    const raw = String(input ?? "").trim()
    if (!raw) return null

    /* A bare id, which is what the composer's own preview round-trips and what a person who
     * copied out of an embed snippet sometimes has. Checked before the URL parse, since it is
     * not one. */
    if (YOUTUBE_ID.test(raw)) return raw

    let url
    try {
        /* Scheme-less is the normal way a link is pasted ("youtu.be/…"), and `new URL` refuses
         * it outright rather than guessing. */
        url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    } catch {
        return null
    }

    const host = url.hostname.replace(/^(www|m|music)\./i, "").toLowerCase()
    const segments = url.pathname.split("/").filter(Boolean)

    /* youtu.be/<id> — the whole path is the id. */
    const candidate =
        host === "youtu.be"
            ? segments[0]
            : host === "youtube.com" || host === "youtube-nocookie.com"
              ? segments[0] === "watch"
                  ? url.searchParams.get("v")
                  : ["embed", "shorts", "live", "v"].includes(segments[0])
                    ? segments[1]
                    : null
              : null

    return candidate && YOUTUBE_ID.test(candidate) ? candidate : null
}

/* The address the video lives at, which is what a post stores and what "Watch on YouTube"
 * opens. The canonical watch page rather than `youtu.be`, because it is the one a person
 * reading the row in a database console recognizes. */
export const youtubeWatchUrl = (id) => `https://www.youtube.com/watch?v=${id}`

/* What the player iframe loads once somebody has asked for it.
 *
 * **`youtube.com` and not `youtube-nocookie.com`, because the privacy-enhanced domain does not
 * play.** Withholding the visitor cookie is exactly the signal YouTube's abuse systems read as
 * automation, so a nocookie embed answers the press with "Sign in to confirm you're not a bot"
 * and the video never starts — reproduced here on every video, on both domains, with and
 * without autoplay: only the cookie mattered. A player that refuses to play is not a privacy
 * feature.
 *
 * **The facade is what protects the reader instead, and protects it better.** Nothing is
 * requested from YouTube until somebody presses play (see `<Video/>`), so a parishioner who
 * scrolls past a video is not served a cookie, a script or a request — which is more than the
 * nocookie domain ever offered, since that one still loads the player for everyone who sees the
 * card.
 *
 * `autoplay` because the reader has already pressed play: the poster is the play button, so a
 * player that arrived stopped would be asking twice. `playsinline` keeps iOS from taking the
 * video fullscreen out of the feed on that same press. `rel=0` keeps the end screen's
 * suggestions to the same channel, which on a parish's own recording is the parish. */
export const youtubeEmbedUrl = (id) =>
    `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0`

/* The same player, reached through a page on this app's own domain — what iOS loads instead.
 *
 * The packaged iOS app serves itself from `capacitor://localhost`, and YouTube refuses to be
 * embedded by an origin that is not http(s) (error 153). That origin cannot be changed:
 * `iosScheme` validates against `WKWebView.handlesURLScheme`, which is true for both http and
 * https, so either value is discarded and the default kept. So the app stops being the
 * embedder and `public/embed.html` becomes it. What YouTube wants is an http(s) origin, not
 * a public one — the page satisfies it equally from a LAN dev server over cleartext http, so
 * this works in development against `next dev` and is not a production-only path.
 *
 * Built off `API_BASE` because that is already the one thing a native build is told about its
 * deployment, and the two are served by the same instance — so a subpath deploy resolves
 * correctly and nothing new has to be configured for video. A build with no
 * `NEXT_PUBLIC_API_BASE_URL` gets a relative path, which is right for the web and is the case
 * that never reaches this function anyway. */
export const youtubeEmbedPageUrl = (id) =>
    `${API_BASE.replace(/\/api\/?$/, "")}/embed.html?v=${id}`

/* The still the card shows in place of the player.
 *
 * `hqdefault` is the one still **every** video has, whatever it was uploaded at and whenever:
 * `maxresdefault` is only generated for HD uploads and 404s for the rest, which on a surface
 * whose entire job is to show a picture is the worst possible failure. So the poster starts at
 * `maxres` and falls back to this on error (see `<Video/>`), rather than the other way
 * around.
 *
 * Both are 4:3 boxes with the 16:9 frame letterboxed inside them, so a poster is drawn
 * `object-cover` in a 16:9 box — which crops the bars back off exactly. */
export const youtubeThumbnail = (id, { max = false } = {}) =>
    `https://i.ytimg.com/vi/${id}/${max ? "maxresdefault" : "hqdefault"}.jpg`

/* ---------------------------------------------------------------------------
 * Calendars
 *
 * Shared by both sides on purpose. The group form validates a pasted calendar link with the
 * same function `calendar.service.js` fetches through, so a URL the server cannot read is
 * refused at the keystroke rather than by an empty month three taps later.
 * ------------------------------------------------------------------------- */

/* A calendar link a person could plausibly paste → the iCalendar feed behind it, or null.
 *
 * **The link somebody can find and the link a server can fetch are two different strings**,
 * and that mismatch is the whole reason this exists. Google's calendar settings page offers a
 * `.../embed?src=…` snippet under "Integrate calendar" — that is what an admin will have to
 * hand, and it is an HTML page. The feed is `.../ical/<id>/public/basic.ics`, further down the
 * same settings page, past the part most people stop reading. Accepting either, plus the bare
 * address of the calendar, is the difference between a feature that works and one that is
 * technically correct.
 *
 * Four accepted forms:
 *
 *   .../embed?src=office@parish.org        the embed link (also `?src=…` on any Google URL)
 *   .../ical/<id>/public/basic.ics         the feed itself, unchanged
 *   https://anything.example/feed.ics      any other iCalendar feed
 *   office@parish.org                      the calendar's address on its own
 *
 * **https only, and that is a rule rather than a default.** This URL is fetched by the server,
 * so a http one is a request an admin can point anywhere the server can reach — see the
 * refusals in `calendar.service.js`, which is where the rest of that argument lives. */
export const icsFeedUrl = (value) => {
    const raw = String(value ?? "").trim()
    if (!raw) return null

    let url
    try {
        url = new URL(raw)
    } catch {
        /* Not a URL at all. A bare calendar address is the one other thing worth accepting —
         * Google names its own calendars that way, and it is exactly what the `src` parameter
         * below carries, so the shortest thing a person can paste ends up on the same feed as
         * the longest.
         *
         * **Tried second, not first.** An embed link contains an `@` and no whitespace, so an
         * address pattern loose enough to accept `office@parish.org` also swallows the whole
         * embed URL and encodes it as a calendar name — which fetches a 404 and shows an empty
         * month. Parsing as a URL is what tells the two apart, and it is unambiguous: an
         * address has no scheme, so `new URL` throws on it. */
        return /^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/.test(raw)
            ? `https://calendar.google.com/calendar/ical/${encodeURIComponent(raw)}/public/basic.ics`
            : null
    }
    if (url.protocol !== "https:") return null

    const src = url.searchParams.get("src")
    if (src) {
        return `https://calendar.google.com/calendar/ical/${encodeURIComponent(src)}/public/basic.ics`
    }

    if (/\.ics$/i.test(url.pathname)) return url.toString()

    /* A Google calendar URL with no `src` — the `/calendar/u/0/r` view of somebody's own
     * calendar, which names no calendar at all and is private to them. Refused rather than
     * guessed at. */
    return null
}

/* A rota's dates, counted into the sentence a collapsed row says.
 *
 * **The one place this arithmetic lives.** The server ships a sheet's slots and nothing derived
 * from them, so this runs on the list, on a sheet just opened, and on the row that has to move
 * the instant somebody signs up — from one function, off whatever slots are in hand. Two copies
 * of it (one projected, one recomputed after a write) is two things to keep in step.
 *
 * `now` is passed in rather than read, because reading the clock during render is impure and the
 * React compiler rejects it; the caller holds a `useNow()`. It also makes "next" mean the
 * reader's next rather than the server's.
 *
 * Cancelled dates count for nothing here — not as a date, not as one needing people, not as one
 * of yours. They are still rendered, struck through, because the parish needs to see that the
 * soup kitchen is off; they are simply not a commitment. */
export const summarize = (slots = [], now = 0) => {
    const upcoming = slots.filter(
        (slot) => !slot.canceled && new Date(slot.endsAt).getTime() >= now,
    )

    return {
        dates: upcoming.length,
        needed: upcoming.filter((slot) => slot.spotsLeft > 0).length,
        mine: upcoming.filter((slot) => slot.mine).length,
        nextAt: upcoming[0]?.startsAt ?? null,
    }
}

/* How full one date is, as the reader is told it.
 *
 * **Taken, never left**, and "Full" instead of a count once it is: a rota is published because
 * it needs people, so the number that moves somebody is the one still short, and "4 of 4 taken"
 * is a sum they have to do to learn there is nothing to do.
 *
 * Written out at each surface that says it, the rule survives only as long as nobody forgets
 * half of it. `slotTallyParts` is the sentence in pieces, for a surface that sets the count
 * apart from the words round it; `slotTally` joins them back for one that does not. */
export const slotTallyParts = (slot) =>
    slot.spotsLeft === 0
        ? { full: true, taken: "", rest: "Full" }
        : { full: false, taken: String(slot.taken), rest: `of ${slot.capacity} taken` }

export const slotTally = (slot) => {
    const { taken, rest } = slotTallyParts(slot)
    return [taken, rest].filter(Boolean).join(" ")
}

/* A title, reduced to the part worth comparing.
 *
 * **The parish keeps one event in two places and neither spelling is wrong.** The Google
 * Calendar says "Cathedral's Kitchen" because that is what it is called; the sign-up sheet says
 * "Cathedral kitchen" because that is what somebody typed into a form. A reader should see one
 * entry on the day, so the two have to be recognised as the same thing.
 *
 * The rules are the smallest set that closes that gap and no more: fold case, drop a possessive
 * (`'s`, and the curly apostrophe a phone actually types), drop a leading "the", reduce
 * everything else to single spaces. Deliberately **not** fuzzy — no edit distance, no stemming,
 * no dropping of short words. A near-miss matcher folding "Vespers" into "Vigil" would hide a
 * service, which is a worse failure than showing two entries, and it would be impossible for a
 * priest to predict or correct. When the rule genuinely cannot see it, `SignupSheet.calendarTitle`
 * is the escape hatch, and it exists because this function is intentionally literal.
 *
 * Shared by both sides: the server merges with it, and the group form uses it to show an admin
 * what their rota will match before they save. */
export const normalizeTitle = (value) =>
    String(value ?? "")
        .toLowerCase()
        .replace(/[\u2019']s\b/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/^the\s+/, "")
        .trim()

/* ---------------------------------------------------------------------------
 * Dates, for the calendar grid
 *
 * Everything here works in the **reader's own timezone**, deliberately. The wire carries
 * instants and the grid asks a question about clocks — "which square does this belong in" —
 * so the conversion has to happen somewhere, and the reader's clock is the one they are
 * looking at. For a parish, where everyone is local, that is also the parish's clock.
 * ------------------------------------------------------------------------- */

/* A date → `YYYY-MM-DD` in local time. The key every calendar surface buckets on, and the same
 * shape `todayLocal()` returns, so the two compare directly. */
export const dayKey = (date) => {
    const value = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(value.getTime())) return ""
    return [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, "0"),
        String(value.getDate()).padStart(2, "0"),
    ].join("-")
}

/* `YYYY-MM-DD` → the local Date it names.
 *
 * Constructed from the three numbers rather than handed to `new Date(string)`, which reads a
 * bare date as **UTC midnight** — so every reader west of Greenwich would get the previous
 * day back. The same trap `todayLocal` exists to avoid, coming the other way. */
export const dateFromKey = (key) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ""))
    if (!match) return null
    const [year, month, day] = match.slice(1).map(Number)
    return new Date(year, month - 1, day)
}

/* The first instant of a month, and of the month `offset` months away. Constructed from parts
 * rather than by adding days, so a 31st never rolls into the following month. */
export const startOfMonth = (date, offset = 0) => {
    const value = new Date(date)
    return new Date(value.getFullYear(), value.getMonth() + offset, 1)
}

/* The squares of a month grid: six rows of seven, Sunday first, with the neighbouring months
 * filling the corners.
 *
 * **Always six rows, never five.** A month that fits in five would leave the grid a row
 * shorter, and since the grid sits above the day's events, every such month would move
 * everything below it up by a row — a jump the reader reads as the page having reloaded. A
 * fixed height costs one greyed-out row and buys a calendar that does not move when it is
 * paged.
 *
 * **Sunday leads**, which is the American convention and, here, the liturgical one: the week
 * begins with the Resurrection, and a parish calendar whose Sundays sat in the last column
 * would put the most important day of the week in the corner. */
export const monthGrid = (date) => {
    const first = startOfMonth(date)
    const start = new Date(first)
    start.setDate(1 - first.getDay())

    return Array.from({ length: 42 }, (_, index) => {
        const day = new Date(start)
        day.setDate(start.getDate() + index)
        return day
    })
}

/* "11:00 AM". Twelve-hour, because that is how an American parish says a time, and built from
 * the parts rather than `toLocaleTimeString` for the reason `formatNameDay` is: this app
 * prerenders to static HTML, and a locale-formatted time differs between the build machine and
 * the reader's browser, which is a hydration mismatch on a screen nobody has touched. */
export const formatTime = (value) => {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ""

    const hours = date.getHours()
    const minutes = date.getMinutes()
    const hour = hours % 12 === 0 ? 12 : hours % 12

    return minutes === 0
        ? `${hour} ${hours < 12 ? "AM" : "PM"}`
        : `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`
}

/* "11 AM to 12:30 PM", or the start alone when there is no meaningful end.
 *
 * The word rather than an en dash: this is read aloud in a parish hall as often as it is read
 * on a screen, and a range with a dash in it is the one place a screen reader says nothing at
 * all where a person would say "to". */
export const formatTimeRange = (start, end) => {
    const from = formatTime(start)
    if (!end) return from
    const to = formatTime(end)
    if (!to || to === from) return from
    return `${from} to ${to}`
}

/* "Sunday, 6 September". The heading over a day's events. */
export const formatDayHeading = (date) => {
    const value = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(value.getTime())) return ""
    return `${WEEKDAY_NAMES[value.getDay()]}, ${value.getDate()} ${MONTHS[value.getMonth()]}`
}

/* Weekday names, spelled out, for the same reason `MONTHS` is a constant rather than a locale
 * call. Sunday first, matching `Date.prototype.getDay()` so an index is a lookup. */
export const WEEKDAY_NAMES = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]

/* ---------------------------------------------------------------------------
 * Route resolution
 *
 * Every "this pathname is special" question the shell asks is answered here, off
 * the RUNTIME_ROUTES / NESTED_TRANSITION_ROUTES registries in constants.js. Never
 * re-derive these with an inline `pathname.startsWith(...)` at a call site — add
 * the route to the registry instead, and every consumer picks it up at once.
 * ------------------------------------------------------------------------- */

/* Segment-safe prefix test: "/p" matches "/p" and "/p/abc" but never "/pizza". */
const isUnder = (pathname, prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)

/* The registered **runtime route** this pathname belongs to, with the dynamic segment it
 * carries — `{ prefix, slide, base, param }` — or null for an ordinary route.
 *
 * This is the primitive: "resolve a URL whose id could not have been known at build time".
 * Both presentations are built on it, and so is anything added later — a route only has to
 * appear in RUNTIME_ROUTES and have a surface registered to become reachable by real URL
 * with no page file and nothing for `generateStaticParams` to enumerate. */
export const runtimeRouteFor = (pathname) => {
    const route = RUNTIME_ROUTES.find((r) => isUnder(pathname, r.prefix))
    if (!route) return null
    const param = pathname.slice(route.prefix.length + 1).split("/")[0] || null
    return { ...route, param }
}

/* …and back: the sheet a pathname names, or null on `/events` itself.
 *
 * The Events surface reads this rather than being handed an id, which is what lets one component
 * serve both entrances — the page and the runtime route — without either of them knowing about
 * the other. */
export const signupIdFor = (pathname) => {
    const route = runtimeRouteFor(pathname ?? "")
    return route?.prefix === ROUTES.SIGNUP ? route.param : null
}

/* The subset that presents as a sliding overlay.
 *
 * **Everything that makes a slide route behave like one keys off this, not off
 * `runtimeRouteFor`** — the suppressed page transition, the nav staying lit on the base, the
 * pushed container, the surface stack. So a runtime route declared `slide: false` gets the
 * URL mechanism and an ordinary cross-fading page, with no further branching anywhere. That
 * separation is the whole point of the split; collapsing these two back into one function
 * would silently give every future settings screen an overlay's semantics. */
export const slideRouteFor = (pathname) => {
    const route = runtimeRouteFor(pathname)
    return route?.slide ? route : null
}

/* A slide-route pathname resolved to the surface it overlays; every other route is itself.
 *
 * This is the registry's answer, and it is the right one for a pathname with nothing mounted
 * behind it — a cold deep link, where `base` is also where a dismissal goes. What the shell is
 * standing on while a surface *it* opened is up is `useShellRoute`. */
export const baseRouteFor = (pathname) => slideRouteFor(pathname)?.base ?? pathname

/* Key for the top-level <PageTransition/>. Collapsing a group of paths to one key suppresses
 * the cross-fade at that level, which is how a nested tree comes to own its own sub-route fades.
 *
 * The shell feeds this `useShellRoute` rather than the pathname, so an open slide route leaves
 * the key untouched and the page underneath never fades or scrolls out from under the overlay. */
export const pageTransitionKey = (pathname) =>
    NESTED_TRANSITION_ROUTES.find((prefix) => isUnder(pathname, prefix)) ??
    baseRouteFor(pathname)

/* Whether a nav destination should read as current. Resolves through `baseRouteFor`, so a
 * slide-route pathname still lights a tab rather than none; the shell passes `useShellRoute`,
 * which is what lights the tab the overlay was opened from. */
/* Does this route take the full width beside the rail? See `FULL_BLEED_ROUTES`. Resolved
 * through `baseRouteFor` like `isRouteActive`, so a conversation still counts as the inbox. */
export const isFullBleed = (pathname) => {
    const base = baseRouteFor(pathname)
    return FULL_BLEED_ROUTES.some((prefix) => isUnder(base, prefix))
}

export const isRouteActive = (pathname, href) => {
    const base = baseRouteFor(pathname)
    return href === ROUTES.DEFAULT ? base === ROUTES.DEFAULT : isUnder(base, href)
}

/* Shared timing for the slide-route push. The incoming surface and the base it
 * pushes both animate on this exact curve — and, being the same width, over the
 * exact same distance — so their touching edges stay locked together for the whole
 * gesture instead of one outrunning the other. iOS-like ease. */
export const SLIDE_TRANSITION = { duration: 0.34, ease: [0.32, 0.72, 0, 1] }

/* How a slide-route surface enters and leaves, per presentation.
 *
 * `modal` is the in-app open: a full viewport of horizontal travel on SLIDE_TRANSITION,
 * which is the exact distance and curve <SlideBase/> pushes the surface behind it. The two
 * are one movement, and they only read as one while both halves of that pairing come from
 * here — which is the reason this is a shared value rather than an object per surface.
 *
 * `page` is the cold load: a shared link or a refresh, where nothing is mounted behind to be
 * pushed. There is no coupled motion to match, so it fades. Sliding a surface in over a blank
 * screen animates a relationship that does not exist. */
export const slideSurfaceAnim = (variant) =>
    variant === "modal"
        ? {
              initial: { x: "100%" },
              animate: { x: 0 },
              exit: { x: "100%" },
              transition: SLIDE_TRANSITION,
          }
        : {
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              exit: { opacity: 0 },
              transition: { duration: 0.2, ease: "easeOut" },
          }

/* Shared timing for a row making room in a list — the comment thread closing over a deleted
 * comment, or sliding down around a new one.
 *
 * A spring, not a duration: a row travels however tall its neighbour turns out to be, and a
 * fixed duration reads as hurried at one line and sluggish at six. Shared so that everything
 * moving in the same list moves together — the rows and the "load more" button below them are
 * one column, and two curves make them visibly separate. Both are just past critically damped,
 * so they settle without overshooting; a list correcting itself should not bounce. */
export const ROW_SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 }

/* The same idea at the scale of a feed card.
 *
 * **A spring settles in roughly the same time whatever the distance**, so one tuned to a
 * 60px comment row covers a 600px post card in the same fraction of a second — which is the
 * definition of a snap. This is the softer end of the same family, for lists whose items are
 * a screenful rather than a line. Reach for `ROW_SPRING` for anything smaller. */
export const CARD_SPRING = { type: "spring", stiffness: 260, damping: 34, mass: 1 }

/* Where a feed caption should stop, and whether there is anything past it.
 *
 * Two things can end the preview and **the earlier one wins**: the character budget, or the
 * author's first line break. The break matters because captions render with
 * `whitespace-pre-line` now — a body written as a list would otherwise spend the whole
 * preview on its first item and leave the "more" affordance stranded on a line of its own,
 * below a paragraph that had already visibly ended. Cutting at the break puts "more"
 * immediately after the last word of the first line, which is where a reader looking for it
 * would look.
 *
 * A break is already a clean boundary, so only the budget cut trims back to a word — doing it
 * on both would eat the last word of the first line for no reason.
 *
 * `\r?\n` rather than `\n`: a stray carriage return would otherwise survive the slice and
 * render as a blank line at the end of the preview.
 *
 * Returns `{ preview, truncated }`; `truncated` is what decides whether "more" is offered at
 * all, and it is not derivable from length alone — a short body with a break in it is
 * truncated, and a long one without is too. */
export function captionPreview(text, limit) {
    const body = String(text ?? "")
    const firstBreak = body.search(/\r?\n/)

    if (firstBreak !== -1 && firstBreak <= limit) {
        return { preview: body.slice(0, firstBreak), truncated: true }
    }

    if (body.length <= limit) return { preview: body, truncated: false }

    return { preview: body.slice(0, limit).replace(/\s+\S*$/, ""), truncated: true }
}

/* A URL as somebody types it into a post: with a scheme, or the bare `www.` form a parish
 * newsletter is written in. Nothing else is a link — an address with no scheme and no `www.`
 * ("stnicholas.org") is indistinguishable from a sentence ending in an abbreviation, and
 * guessing turns "Vespers at 6 p.m." into a dead link. */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s]+/gi

/* Punctuation that ends the sentence rather than the URL. The closing bracket is the awkward
 * one: it belongs to the link in a Wikipedia path and to the prose in "(see https://x.org)",
 * so it is given up only while the match has no opening bracket left to pair it with. */
const SENTENCE_END = /[.,;:!?'"“”‘’«»]/

const trimTrailing = (url) => {
    let end = url.length

    while (end > 0) {
        const char = url[end - 1]

        if (SENTENCE_END.test(char)) {
            end -= 1
            continue
        }

        if (char === ")") {
            const head = url.slice(0, end - 1)
            const opened = head.split("(").length
            const closed = head.split(")").length
            if (closed >= opened) {
                end -= 1
                continue
            }
        }

        break
    }

    return url.slice(0, end)
}

/* Splits a body into the runs a reader can tap and the runs they cannot: an array of
 * `{ text }` parts, each carrying an `href` if it is a link.
 *
 * A tokenizer rather than a string of HTML, because the bodies it runs over are author input
 * and the only safe way to render those is as React children — `dangerouslySetInnerHTML` on a
 * post body would let anyone in the parish publish markup into everyone else's feed.
 *
 * `href` is separate from `text` so the reader sees what they typed while the link still
 * resolves: a `www.` address is displayed bare and navigates to `https://`. */
export function linkTokens(text) {
    const body = String(text ?? "")
    const parts = []
    let cursor = 0

    for (const match of body.matchAll(URL_PATTERN)) {
        const url = trimTrailing(match[0])
        /* The pattern can match a scheme with nothing behind it once the trailing punctuation
         * is given back ("https://." in prose). That is not an address. */
        if (!/^(?:https?:\/\/|www\.)[^\s]/i.test(url)) continue

        if (match.index > cursor) parts.push({ text: body.slice(cursor, match.index) })

        parts.push({
            text: url,
            href: /^www\./i.test(url) ? `https://${url}` : url,
        })

        cursor = match.index + url.length
    }

    if (cursor < body.length) parts.push({ text: body.slice(cursor) })

    return parts
}

/* Bytes → the short string an attachment renders. Formatted at the edge rather than stored,
 * so the underlying number stays sortable and re-formattable.
 *
 * Shared with the server: `projectMedia` formats a post's document with this, and the
 * composer's optimistic row formats the file it just uploaded with the same function — so the
 * card cannot say "2.4 MB" before the server replies and "2.5 MB" after. */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return null
    if (bytes < 1024) return `${bytes} B`

    const units = ["KB", "MB", "GB"]
    let value = bytes / 1024
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/* An attachment's short type label ("pdf", "docx"), from the filename then the mime type.
 * Shared with the server for the same reason `formatBytes` is. */
export function documentType({ fileName, mimeType } = {}) {
    const fromName = fileName?.split(".").pop()?.toLowerCase()
    if (fromName && fromName !== fileName?.toLowerCase()) return fromName
    return mimeType?.split("/").pop()?.toLowerCase() ?? "file"
}

/* Compact tally for like/comment counts: 182 → "182", 2629 → "2.6K". */
export function formatCompact(n) {
    return Number(n ?? 0).toLocaleString("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
    })
}

/* Display label for an enum string.
 *
 * The API sends SCREAMING_SNAKE_CASE for roles, vocations, and membership statuses,
 * because that is what the Prisma enums are; the UI wants "Admin", "Faithful", "Pending".
 * Handles multi-word values ("HOLY_SYNOD" → "Holy Synod") so a new enum member does not
 * need a lookup table. */
/* Up to two letters for a group's gradient mark — "Holy Trinity Cathedral" → "HT".
 *
 * Splitting the name is right here and wrong for a person (see `initials` in lib/name.js):
 * an organization has one name and no parts to assemble it from, and the words in it are
 * the only structure available. A single-word name takes its first two letters instead, so
 * "Antiochian" reads as "AN" rather than a lone "A" that half the diocese would share. */
export function orgInitials(name) {
    const words = String(name ?? "").trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ""
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
}

export function roleLabel(role) {
    if (!role) return "User"
    return String(role)
        .toLowerCase()
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
}

/* Deterministic per-value avatar gradient. Same input always maps to the same
 * gradient so each user gets a stable, distinct color. */
export function gradientFor(value) {
    const str = String(value ?? "")
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
    }
    const hue = Math.abs(hash) % 360
    const light = `hsl(${hue} 90% 82%)`
    const mid = `hsl(${hue} 75% 58%)`
    const dark = `hsl(${(hue + 18) % 360} 70% 40%)`

    return {
        backgroundImage: `radial-gradient(circle at 30% 25%, ${light} 0%, ${mid} 45%, ${dark} 100%)`,
    }
}

/* "#rrggbb" → { r, g, b } (0–255). */
function hexToRgb(hex) {
    const value = parseInt(String(hex).replace("#", ""), 16)
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

/* "#rrggbb" → "rgba(r, g, b, a)". For canvas paint servers, where gradient stops
 * need a per-stop alpha and Tailwind tokens aren't available. */
export function withAlpha(hex, alpha) {
    const { r, g, b } = hexToRgb(hex)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/* One stable index per string, for everything in the app that colours a thing by its name.
 *
 * xorshift-multiply (the murmur3 finalizer over a djb2 seed), which matters only in that it
 * avalanches: "Coffee hour" and "Coffee hours" have to land on different colours, and a plain
 * djb2 sends near-identical strings to near-identical values, so a parish whose rotas are named
 * alike would get one colour for all of them. Pure and stable, so a rota is the same colour on
 * every device and every year — which is the whole reason to hash rather than store a colour. */
function hashString(input) {
    const str = String(input ?? "")
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
    }
    hash ^= hash >>> 16
    hash = Math.imul(hash, 0x85ebca6b)
    hash ^= hash >>> 13
    hash = Math.imul(hash, 0xc2b2ae35)
    hash ^= hash >>> 16
    return hash >>> 0
}

const BADGE_COLOR_PALETTE = [
    "text-red-600 bg-red-600/10 border-red-600/30 dark:text-red-400 dark:bg-red-400/10 dark:border-red-400/40",
    "text-teal-600 bg-teal-600/10 border-teal-600/30 dark:text-teal-400 dark:bg-teal-400/10 dark:border-teal-400/40",
    "text-fuchsia-600 bg-fuchsia-600/10 border-fuchsia-600/30 dark:text-fuchsia-400 dark:bg-fuchsia-400/10 dark:border-fuchsia-400/40",
    "text-lime-700 bg-lime-700/10 border-lime-700/30 dark:text-lime-400 dark:bg-lime-400/10 dark:border-lime-400/40",
    "text-indigo-600 bg-indigo-600/10 border-indigo-600/30 dark:text-indigo-400 dark:bg-indigo-400/10 dark:border-indigo-400/40",
    "text-orange-600 bg-orange-600/10 border-orange-600/30 dark:text-orange-400 dark:bg-orange-400/10 dark:border-orange-400/40",
    "text-cyan-600 bg-cyan-600/10 border-cyan-600/30 dark:text-cyan-400 dark:bg-cyan-400/10 dark:border-cyan-400/40",
    "text-pink-600 bg-pink-600/10 border-pink-600/30 dark:text-pink-400 dark:bg-pink-400/10 dark:border-pink-400/40",
    "text-green-600 bg-green-600/10 border-green-600/30 dark:text-green-400 dark:bg-green-400/10 dark:border-green-400/40",
    "text-violet-600 bg-violet-600/10 border-violet-600/30 dark:text-violet-400 dark:bg-violet-400/10 dark:border-violet-400/40",
    "text-amber-700 bg-amber-700/10 border-amber-700/30 dark:text-amber-400 dark:bg-amber-400/10 dark:border-amber-400/40",
    "text-sky-600 bg-sky-600/10 border-sky-600/30 dark:text-sky-400 dark:bg-sky-400/10 dark:border-sky-400/40",
    "text-rose-600 bg-rose-600/10 border-rose-600/30 dark:text-rose-400 dark:bg-rose-400/10 dark:border-rose-400/40",
    "text-emerald-600 bg-emerald-600/10 border-emerald-600/30 dark:text-emerald-400 dark:bg-emerald-400/10 dark:border-emerald-400/40",
    "text-purple-600 bg-purple-600/10 border-purple-600/30 dark:text-purple-400 dark:bg-purple-400/10 dark:border-purple-400/40",
    "text-yellow-700 bg-yellow-700/10 border-yellow-700/30 dark:text-yellow-400 dark:bg-yellow-400/10 dark:border-yellow-400/40",
    "text-blue-600 bg-blue-600/10 border-blue-600/30 dark:text-blue-400 dark:bg-blue-400/10 dark:border-blue-400/40",
]


/* A tinted pill's classes for a string: readable text on a wash of its own colour. */
export function hashColorScheme(value) {
    return BADGE_COLOR_PALETTE[hashString(value) % BADGE_COLOR_PALETTE.length]
}

/* One of the 25 Chroma Spheres for a string, as a URL.
 *
 * **A file rather than a CSS gradient, and not inlined.** These are Illustrator meshes: nine
 * stacked circles under `mix-blend-mode`, which is what produces the dark core and the
 * iridescent rim that no two- or three-stop `radial-gradient` reproduces. They cannot be
 * inlined as components either — each carries its own `.cls-1…` style block and
 * `#radial-gradient…` ids, so two on one page would collide on both. Loaded through CSS as
 * separate documents, each is its own scope and only the rows actually on screen fetch one.
 *
 * The 400KB the artwork ships with is a 1018px grain PNG baked into every file. It is stripped:
 * `<Grain/>` already lays one over the whole app, so a second per orb would be grain over
 * grain, at 25 times the weight of the thing it decorates. What is left is ~7KB apiece.
 *
 * Hashed the same way a badge colour is, so a value keeps its sphere across devices and years,
 * and `appPath` because a subpath deploy has to reach it too. */
const SPHERE_COUNT = 25

export const sphereFor = (value) =>
    appPath(`/spheres/${String((hashString(value) % SPHERE_COUNT) + 1).padStart(2, "0")}.svg`)

/* Eighteen or older, by calendar arithmetic on the date alone — a birthday is a
 * calendar date (see `Profile.birthday`), so the comparison must not involve hours or
 * timezones. Null is **not** adult: messaging is gated on this, and an unknown age
 * failing open would put the one feature with an age floor in front of the one person
 * whose age nobody recorded. Shared by the server gate (`requireMessaging`) and the client
 * chrome that hides the entrance, so the two cannot disagree.
 *
 * Accepts a Date or an ISO string, because the server holds the column as a Date and
 * the client receives it as a string. */
export const isAdult = (birthday) => {
    if (!birthday) return false
    const date = new Date(birthday)
    if (Number.isNaN(date.getTime())) return false

    const now = new Date()
    let age = now.getUTCFullYear() - date.getUTCFullYear()
    const monthDay = (now.getUTCMonth() + 1) * 100 + now.getUTCDate()
    const birthMonthDay = (date.getUTCMonth() + 1) * 100 + date.getUTCDate()
    if (monthDay < birthMonthDay) age -= 1
    return age >= 18
}

/* ---------------------------------------------------------------------------
 * Versions
 * ------------------------------------------------------------------------- */

/* Whether `version` is behind `floor`. False whenever the answer is not plainly yes.
 *
 * This is the whole of the force-update decision, so every uncertainty resolves to "keep
 * going": no floor, a floor that is not three dotted numbers, a version that is not either. The
 * value comes from a text field in a console, and the cost of reading a typo as a floor nothing
 * satisfies is every phone in every parish walled out of the app at once, with the people it
 * happened to unable to do anything about it.
 *
 * Numeric per part, not lexical: "0.2.0" is ahead of "0.10.0" as a string and behind it as a
 * version. Prerelease and build suffixes are not understood and are not meant to be — the
 * versions this compares are what `npm version patch` writes and what Gradle derives a
 * versionCode from, which is three numbers and nothing else. */
const VERSION_PARTS = /^(\d+)\.(\d+)\.(\d+)$/

export const olderThan = (version, floor) => {
    const left = VERSION_PARTS.exec(String(version ?? ""))
    const right = VERSION_PARTS.exec(String(floor ?? ""))
    if (!left || !right) return false

    for (let i = 1; i <= 3; i += 1) {
        const a = Number(left[i])
        const b = Number(right[i])
        if (a !== b) return a < b
    }
    return false
}
