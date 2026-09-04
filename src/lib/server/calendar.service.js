import "server-only"

import dns from "node:dns/promises"
import net from "node:net"

import { MAX_CALENDAR_DAYS } from "@/lib/constants"
import { invalid, notFound, unavailable } from "@/lib/server/errors"
import { dayIn, expandCalendar } from "@/lib/server/ical"
import { projectCalendarEntry, projectCalendarSlot } from "@/lib/server/projections"
import { requireMembership } from "@/lib/server/auth"
import { slotsInWindow } from "@/lib/server/signups.service"
import { icsFeedUrl, normalizeTitle } from "@/lib/utils"

/* The compiled calendar: a group's own events and its sign-up slots, in one window.
 *
 * ── Why the parish's calendar is a feed and not a table ──────────────────────
 *
 * A parish already keeps its calendar somewhere, and has for years — the Cathedral's lives in
 * a Google Calendar the office maintains. Grapevine reads it; it does not own it. Importing
 * those events into these tables would make the app a *second* place every service has to be
 * corrected, and the first correction that happened in only one of them would be the last
 * time anybody trusted either. So `Organization.calendarUrl` names a feed, this file expands
 * it per request, and the parish secretary carries on working the way she already does.
 *
 * The cost is a network call in a read path, which is exactly the thing
 * backend-architecture.md's "Round trips are the cost" section says to count. It is paid down
 * three ways: the response is cached per feed for `CACHE_MS`, the fetch runs in parallel with
 * the slot query rather than after it, and a feed that is slow or broken degrades to the
 * sign-ups alone rather than failing the request — a month with no parish services in it is a
 * worse answer than a month, but it is an answer.
 *
 * ── Fetching a URL somebody typed ────────────────────────────────────────────
 *
 * `calendarUrl` is set by a group admin and fetched by the server, which makes it a
 * server-side request forgery surface: the value is a URL, and the server can reach things
 * the admin cannot, including the metadata endpoints of whatever this is deployed on. Three
 * checks stand between the two, and all three are here rather than at the write, because a
 * value can be written once and fetched forever and DNS can change underneath it:
 *
 *   1. **https only**, enforced by `icsFeedUrl` — a scheme is the cheapest half of the check.
 *   2. **The resolved address must be public.** Loopback, private, link-local and unique-local
 *      ranges are refused after DNS resolution, which is what closes a hostname that resolves
 *      to 169.254.169.254 today and to nothing yesterday.
 *   3. **No redirects.** `redirect: "manual"` — following one would land at an address that
 *      never passed check 2.
 *
 * Together with the size and time caps below, the worst an admin can do with this field is
 * point their own parish's calendar at somebody else's public calendar.
 */

/* How long a fetched feed is reused. Ten minutes is chosen against what the reader is doing
 * rather than against how often a calendar changes: paging back and forth through months is
 * one request per month, and a parish secretary who has just added a service will be looking
 * at Google rather than at this. It is a per-process cache, so a multi-instance deploy simply
 * has a colder one — correctness does not depend on it. */
const CACHE_MS = 10 * 60 * 1000

/* Ceilings on what a third party can spend of this request. A parish calendar is tens of
 * kilobytes; anything approaching a megabyte is not one, and eight seconds is already longer
 * than the whole rest of the response. */
const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 8000

const cache = new Map()

/* Is this address one the server can reach but the public cannot? Everything the private
 * ranges cover, plus the two that matter most on a cloud host: loopback, and the link-local
 * `169.254.0.0/16` that carries instance metadata. */
const isPrivateAddress = (address) => {
    if (net.isIPv4(address)) {
        const [a, b] = address.split(".").map(Number)
        return (
            a === 0 || a === 10 || a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            a >= 224
        )
    }
    const value = address.toLowerCase()
    return (
        value === "::1" || value === "::" ||
        value.startsWith("fc") || value.startsWith("fd") ||
        value.startsWith("fe80") ||
        /* An IPv4-mapped address is an IPv4 address wearing a hat, so unwrap and re-ask. */
        (value.startsWith("::ffff:") && isPrivateAddress(value.slice(7)))
    )
}

/* Refuses a feed whose hostname resolves anywhere private. See check 2 in the header. */
const assertPublicHost = async (hostname) => {
    /* A literal address skips resolution and is checked directly, which is also the case a
     * resolver would happily hand straight back. */
    if (net.isIP(hostname)) {
        if (isPrivateAddress(hostname)) throw invalid("That calendar address cannot be reached.")
        return
    }

    let addresses
    try {
        addresses = await dns.lookup(hostname, { all: true })
    } catch {
        throw unavailable("Could not reach that calendar.")
    }
    if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
        throw invalid("That calendar address cannot be reached.")
    }
}

/* One feed's text, from the cache or from the network.
 *
 * **A failure is cached too, briefly.** A parish whose calendar has been deleted would
 * otherwise pay a full timeout on every month the reader pages to, which turns one broken
 * setting into a calendar that feels broken. The negative entry is a quarter of the positive
 * one, so a calendar that comes back is picked up within a couple of minutes. */
const fetchFeed = async (feedUrl) => {
    const cached = cache.get(feedUrl)
    if (cached && cached.expires > Date.now()) {
        if (cached.error) throw cached.error
        return cached.text
    }

    const remember = (entry, ttl) => {
        cache.set(feedUrl, { ...entry, expires: Date.now() + ttl })
        /* The map is keyed by feed URL and a deployment serves a bounded number of parishes,
         * so it cannot grow without bound in practice — but a sweep of expired entries costs
         * nothing on a map this size and keeps that true after a group is deleted. */
        for (const [key, value] of cache) {
            if (value.expires <= Date.now()) cache.delete(key)
        }
    }

    const url = new URL(feedUrl)
    await assertPublicHost(url.hostname)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
        const response = await fetch(feedUrl, {
            signal: controller.signal,
            /* Not `follow`: a redirect is a second address, and it would not have passed the
             * check above. Google's feed does not redirect. */
            redirect: "manual",
            headers: { Accept: "text/calendar, text/plain;q=0.9" },
        })

        if (!response.ok) {
            /* A 404 here is the ordinary failure — the calendar was made private again, or the
             * address was mistyped — and it is the admin's to fix, so it is reported as such
             * rather than as a server fault. */
            throw response.status === 404 || response.status === 403
                ? notFound("That calendar is not published, or the address is wrong.")
                : unavailable("Could not read that calendar just now.")
        }

        const text = await readCapped(response)
        remember({ text }, CACHE_MS)
        return text
    } catch (error) {
        const failure =
            error?.code || error?.status
                ? error
                : unavailable("Could not read that calendar just now.")
        remember({ error: failure }, CACHE_MS / 4)
        throw failure
    } finally {
        clearTimeout(timer)
    }
}

/* The body, up to `MAX_BYTES`, abandoning the rest.
 *
 * Read as a stream rather than with `response.text()` because a `Content-Length` is a claim
 * and not a promise: a hostile or broken server can answer a small length and then send
 * gigabytes, and `text()` would buffer all of it before this function ever saw a number. */
const readCapped = async (response) => {
    const reader = response.body?.getReader()
    if (!reader) return ""

    const decoder = new TextDecoder()
    let text = ""
    let bytes = 0

    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > MAX_BYTES) {
            await reader.cancel()
            throw invalid("That calendar is too large to read.")
        }
        text += decoder.decode(value, { stream: true })
    }

    return text + decoder.decode()
}

/* The window a request asked for, clamped and sanity-checked.
 *
 * The client sends the six weeks its grid draws; the ceiling is here because the window is
 * what bounds the recurrence expansion of a feed this app does not control, and an unbounded
 * one is an unbounded response. */
const readWindow = ({ from, to }) => {
    const start = new Date(from ?? "")
    const end = new Date(to ?? "")

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw invalid("A calendar window needs a start and an end.", {
            from: from ? undefined : "Required",
            to: to ? undefined : "Required",
        })
    }
    if (end <= start) {
        throw invalid("A calendar window has to end after it starts.", { to: "Invalid" })
    }
    if (end - start > MAX_CALENDAR_DAYS * 86400000) {
        throw invalid(`A calendar window can be at most ${MAX_CALENDAR_DAYS} days.`, {
            to: "Too far",
        })
    }

    return { start, end }
}

/* The parish's own events in a window, or an empty list.
 *
 * **Every failure here is swallowed**, and that is the deliberate part. This is half of a
 * screen whose other half — the sign-ups — is this app's own data and is always available. A
 * calendar that is unreachable, unpublished, or malformed must not take the sign-ups down
 * with it, so it degrades to nothing and the surface says the group has no calendar. The
 * admin finds out where they can act on it, which is the group settings form: `previewCalendar`
 * runs the same fetch and reports the error, because there the failure is the answer. */
const parishEvents = async (org, window) => {
    const feedUrl = icsFeedUrl(org.calendarUrl)
    if (!feedUrl) return []

    try {
        const text = await fetchFeed(feedUrl)
        return expandCalendar(text, { from: window.start, to: window.end })
    } catch {
        return []
    }
}

/* Folds a rota into the parish event that is the same thing under another spelling.
 *
 * ── The problem, in one screen ───────────────────────────────────────────────
 *
 * The Cathedral's Google Calendar has "Cathedral's Kitchen" on Saturday, because it happens.
 * The sign-up sheet is called "Cathedral kitchen", because it needs hands. Left alone they are
 * two blocks on one day describing one thing, and the reader has to work out that they are not
 * two commitments.
 *
 * ── How they are matched ─────────────────────────────────────────────────────
 *
 * Same day, same normalized title — that is the whole rule. `normalizeTitle` folds case, a
 * possessive and a leading "the", and nothing else; see its note for why it is deliberately
 * literal rather than fuzzy. A sheet whose parish calendar calls it something unguessable sets
 * `calendarTitle`, which is used in place of its own title here.
 *
 * A parish event is consumed by **at most one** slot, which is what stops a rota split into six
 * two-hour shifts from swallowing the same event six times. The shifts after the first stay as
 * their own blocks, which is correct: they are six commitments, and only the day's event is one.
 *
 * ── What a merged entry is ───────────────────────────────────────────────────
 *
 * A **sign-up**, because that is the half a reader can act on, wearing the union of the two time
 * spans and whatever the parish event knew that a rota does not — its location. The union is the
 * honest span when the two disagree: the parish's own entry is often the fuller one ("the
 * kitchen runs nine to one") and the rota only covers the part that needs volunteers.
 *
 * The parish event's own title is deliberately not carried over. To the reader this is one
 * thing happening on one day; that the parish files it under two names is our problem, not
 * theirs. */
const mergeCalendar = (parishEvents, slots) => {
    const consumed = new Set()

    const merged = slots.map((slot) => {
        const timeZone = slot.timeZone
        const key = normalizeTitle(slot.matchTitle)
        if (!key) return slot

        const day = dayIn(new Date(slot.startsAt), timeZone)
        const match = parishEvents.find(
            (event) =>
                !consumed.has(event.id) &&
                normalizeTitle(event.title) === key &&
                dayIn(new Date(event.startsAt), timeZone) === day,
        )
        if (!match) return slot

        consumed.add(match.id)
        return {
            ...slot,
            startsAt:
                match.startsAt < slot.startsAt ? match.startsAt : slot.startsAt,
            endsAt: match.endsAt > slot.endsAt ? match.endsAt : slot.endsAt,
            location: match.location ?? null,
        }
    })

    return [...merged, ...parishEvents.filter((event) => !consumed.has(event.id))]
}

/* The compiled calendar for one group and one window.
 *
 * Member of the group, like every other read — `orgId` is required rather than optional
 * because a calendar is a group's, and a union across a viewer's parishes would put a
 * diocese's Vespers on the same square as a parish's coffee hour with nothing to tell them
 * apart. The feed and the slots are fetched **in parallel**: one is a network call to Google
 * and the other a query, and nothing in either depends on the other's result. */
export const listCalendar = async (viewer, { orgId, from, to }) => {
    const membership = requireMembership(viewer, orgId)
    const window = readWindow({ from, to })

    const [events, slots] = await Promise.all([
        parishEvents(membership.org, window),
        slotsInWindow(orgId, window),
    ])

    /* The two match keys ride on the projected slot rather than being looked up again inside
     * the merge: the sheet was already joined, and passing the row down would mean the merge
     * knowing about Prisma shapes. They are stripped before the response goes out — see below. */
    const projected = slots.map((slot) => ({
        ...projectCalendarSlot(slot, viewer.id),
        matchTitle: slot.sheet.calendarTitle || slot.sheet.title,
        timeZone: slot.sheet.timezone,
    }))

    const items = mergeCalendar(events.map(projectCalendarEntry), projected)
        .map(({ matchTitle: _matchTitle, timeZone: _timeZone, ...entry }) => entry)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title))

    return {
        items,
        /* Not paginated, and the window is why: the caller asked for six weeks and gets all
         * of them, because a grid cannot draw half a month. The key is still here because the
         * contract says a collection carries it. */
        nextCursor: null,
        /* Whether this group has a calendar at all, which the surface needs in order to tell
         * "nothing this month" apart from "no calendar has been set up" — two empty screens
         * that want completely different words on them. It is the *configured* answer, not
         * the fetched one: a calendar that failed to load this minute is still a calendar. */
        hasCalendar: Boolean(icsFeedUrl(membership.org.calendarUrl)),
    }
}

/* Does this URL name a calendar this server can actually read, and what is in it?
 *
 * Used by the group settings form the moment an admin pastes one, which is the only place a
 * fetch failure is worth reporting: there, "we could not read that" is the answer to the
 * question being asked, where on the Events surface it would be an error about somebody
 * else's configuration shown to a parishioner who cannot act on it.
 *
 * It is a **read of a URL rather than of a group**, so it does not touch the database at all
 * — which is what lets it run before the URL has been saved. */
export const previewCalendar = async (viewer, orgId, url) => {
    requireMembership(viewer, orgId, { role: "ADMIN" })

    const feedUrl = icsFeedUrl(url)
    if (!feedUrl) {
        throw invalid(
            "That does not look like a calendar link. Paste the address of a public Google Calendar.",
            { calendarUrl: "Invalid" },
        )
    }

    const now = Date.now()
    const text = await fetchFeed(feedUrl)
    const events = expandCalendar(text, {
        from: new Date(now - 7 * 86400000),
        to: new Date(now + 60 * 86400000),
        limit: 3,
    })

    return {
        /* Enough for the form to say "Found 3 events, next is Divine Liturgy on Sunday" —
         * which is the only confirmation that means anything, since a valid URL that names an
         * empty calendar is the failure an admin will actually hit. */
        events: events.map(projectCalendarEntry),
    }
}

/* Drops a feed from the cache, so an admin who has just fixed their calendar's sharing
 * settings sees the result on the next load rather than in ten minutes. Called by `updateOrg`
 * when the URL changes, and by `previewCalendar`'s caller after a successful save. */
export const forgetCalendar = (url) => {
    const feedUrl = icsFeedUrl(url)
    if (feedUrl) cache.delete(feedUrl)
}
