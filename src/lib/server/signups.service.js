import "server-only"

import {
    MAX_CLAIM_NOTE_LENGTH,
    MAX_GENERATED_SLOTS,
    MAX_ON_BEHALF_OF_LENGTH,
    MAX_SHEET_SLOTS,
    MAX_SIGNUP_DESCRIPTION_LENGTH,
    MAX_SIGNUP_TITLE_LENGTH,
    MAX_SLOT_CAPACITY,
    MAX_SLOT_HOURS,
    MAX_SLOT_NOTE_LENGTH,
    MIN_SLOT_MINUTES,
    SIGNUP_HORIZON_DAYS,
    SIGNUP_PATTERNS,
    SIGNUP_REMINDER_OFFSETS,
    SIGNUP_STATUS,
} from "@/lib/constants"
import { prisma } from "@/lib/db"
import { membershipIn, requireMembership } from "@/lib/server/auth"
import { keysetOrder, keysetPage, keysetWhere } from "@/lib/server/cursor"
import { conflict, forbidden, invalid, notFound } from "@/lib/server/errors"
import { instantToZoned, zonedToInstant } from "@/lib/server/ical"
import {
    newPostRecipients,
    notifySignupCanceled,
    notifySignupPublished,
    notifySignupReminder,
    pushSignupCanceled,
    pushSignupPublished,
    pushSignupReminder,
} from "@/lib/server/notifications.service"
import { projectSignupSheet, projectSignupSlot } from "@/lib/server/projections"

/* Sign-up sheets: publishing a rota, and taking a place on one.
 *
 * ── Two authorities, and they are the ones this app already had ──────────────
 *
 * Publishing a sheet is publishing into a group, so it is **ADMIN of that group** — the same
 * permission as a post, for the same reason: a rota is the parish asking, not a member
 * offering. Taking a slot is **MEMBER**, like a comment. There is no third rule and no new
 * axis; every function below resolves the sheet's organization and then asks
 * `requireMembership` the one question the rest of the app asks.
 *
 * ── Materialized slots ───────────────────────────────────────────────────────
 *
 * A sheet's dates are rows, written by `generateSlots` at creation and again whenever an
 * admin extends the rota. They are not a recurrence rule evaluated at read time, and the
 * reason is the third sentence of every real conversation about a parish rota: "no soup
 * kitchen on the 24th, and we need six people on the 31st". A rule cannot hold an exception
 * without a second table of exceptions, which is this table with extra steps — and a claim
 * has to point at *something*, which means the occurrence has to exist as a row before
 * anybody can sign up for it. The generator is what keeps the rule's convenience.
 *
 * ── Capacity is enforced by the database, not by the reader ──────────────────
 *
 * `claimSlot` is the one interactive transaction here, and its own header says why.
 */

/* ---------------------------------------------------------------------------
 * Reading
 * ------------------------------------------------------------------------- */

/* What a slot needs joined to be projected: the people in it, and enough of each to draw a
 * byline. `orderBy` is the order they signed up in, so the list reads as the rota filled.
 *
 * **This is the body of an `include`, not a set of relation arguments**, and the difference
 * bites: `include: claimInclude` is right, and spreading it into a nested relation's arguments
 * — `slots: { where, orderBy, ...claimInclude }` — puts `claims` beside `where` where it is not
 * a valid key, which Prisma rejects at runtime. Nothing catches it earlier: query arguments are
 * plain objects, so neither the build nor eslint can see it. Reach for `slotsWithClaims` below
 * whenever the slots are a *nested* relation. */
const claimInclude = {
    claims: {
        orderBy: { createdAt: "asc" },
        include: {
            profile: {
                select: {
                    handle: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                    vocation: true,
                    avatarUrl: true,
                },
            },
        },
    },
}

/* A sheet's `slots` relation, with the people on each one joined.
 *
 * Exists so there is one correct shape for the nested case and no second way to write it. See
 * the note on `claimInclude`: the arguments of a relation and the body of its `include` are two
 * different objects, and merging them is a runtime error rather than a type error. */
const slotsWithClaims = (args = {}) => ({ ...args, include: claimInclude })

/* The slot window the compiled calendar reads, across every live sheet in one group.
 *
 * Exported for `calendar.service.js` rather than inlined there, because the *shape* of a slot
 * — which sheets count, what "live" means, which claims are joined — is this file's to decide,
 * and a second copy of `deletedAt: null, status: OPEN` in another service is the copy that
 * gets forgotten when a third state is added.
 *
 * One statement, with `relationLoadStrategy: "join"`: without it Prisma issues a SELECT per
 * relation, which for slots + sheets + claims + profiles is four. */
export const slotsInWindow = (orgId, { start, end }) =>
    prisma.signupSlot.findMany({
        where: {
            startsAt: { gte: start, lt: end },
            sheet: { orgId, deletedAt: null },
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        include: {
            /* `timezone` and `calendarTitle` are here for the merge rather than for display:
             * folding a rota into the parish event of the same name is a question about which
             * *day* the two fall on, and a day is a question about a clock. See
             * `mergeCalendar`. */
            sheet: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    timezone: true,
                    calendarTitle: true,
                },
            },
            claims: { select: { id: true, profileId: true, onBehalfOf: true } },
        },
        relationLoadStrategy: "join",
    })

/* The slots a sheet shows, and it is deliberately not all of them.
 *
 * A rota that has run since Pascha has forty past Sundays on it and nobody is going to sign up
 * for any of them. The sheet opens on what is still to come, plus a fortnight of what just
 * happened — because "did anybody bring the food last week" is the second question a parish
 * asks about a rota, and answering it costs a handful of rows.
 *
 * `getSheet` takes `all` for the one caller that genuinely wants the whole history: the manage
 * surface, where an admin is editing dates rather than signing up for them. */
const slotWindow = () => ({ gte: new Date(Date.now() - 14 * 86400000) })

/* The same instant, `days` later on the parish's clock.
 *
 * Out to wall time, add whole days there, back to an instant — never by adding milliseconds,
 * which walks an hour off across a daylight-saving boundary and would put a rota that has run
 * at nine every Saturday since Pascha at eight for the winter. Same reason `generateSlots`
 * steps dates rather than instants. */
const shiftDays = (date, days, timeZone) =>
    new Date(zonedToInstant(instantToZoned(date.getTime(), timeZone) + days * 86400000, timeZone))

/* The local day an instant falls on, for grouping a rota's last date back into its slots. */
const dayOf = (date, timeZone) =>
    new Date(instantToZoned(date.getTime(), timeZone)).toISOString().slice(0, 10)

/* Keeps an ongoing rota stocked to the horizon.
 *
 * ── What "forever" is, mechanically ─────────────────────────────────────────
 *
 * A rota marked `repeats` has no end date, and slots are rows — so something has to keep
 * writing them. This does: it takes the **last day already on the sheet** and repeats that day's
 * slots a week at a time until the rota reaches `SIGNUP_HORIZON_DAYS`. No stored rule is
 * consulted, because the rows are the rule; an admin who moved the rota to ten o'clock has
 * moved every future one, and a sheet whose last day carries three two-hour shifts gets three
 * again next week.
 *
 * ── Why a read writes ───────────────────────────────────────────────────────
 *
 * This is a write on a `GET`, which is a thing to be uneasy about, so here is the whole case:
 *
 *  - **It has to happen without infrastructure.** The alternative is a scheduled job, and this
 *    app's one existing schedule (`npm run signups:remind`) is optional — a deploy without it
 *    sends no reminders, which is a degradation. A deploy without it silently *running out of
 *    Saturdays* is a broken feature, discovered by a parish with nobody signed up.
 *  - **It is idempotent.** `@@unique([sheetId, startsAt])` plus `skipDuplicates` means two
 *    concurrent readers write the same rows once between them. There is no lock to take and no
 *    race to lose.
 *  - **It almost never fires.** The check is arithmetic over slots the read already loaded, and
 *    the write only happens when the rota is short — once a week, per rota.
 *
 * `createManyAndReturn` rather than `createMany`, because the rows are handed straight back into
 * the response: the alternative is re-reading the sheet to learn the ids of what was just
 * inserted, which is the round trip this whole file is written to avoid.
 *
 * The ceiling is `MAX_SHEET_SLOTS`, which for a weekly rota is about ten years. Reaching it
 * stops the extension rather than failing the read; a rota that old wants its past pruned, not
 * the ceiling raised. */
const topUpRecurring = async (sheets) => {
    const horizon = new Date(Date.now() + SIGNUP_HORIZON_DAYS * 86400000)

    await Promise.all(
        sheets.map(async (sheet) => {
            if (!sheet.repeats || sheet.deletedAt) return
            if (sheet.status !== SIGNUP_STATUS.OPEN) return

            const slots = sheet.slots ?? []
            if (slots.length === 0) return

            const last = slots[slots.length - 1]
            if (last.startsAt >= horizon) return

            /* The last day's slots, in order — the template a week is cut from. */
            const lastDay = dayOf(last.startsAt, sheet.timezone)
            const template = slots.filter(
                (slot) => dayOf(slot.startsAt, sheet.timezone) === lastDay,
            )

            const room = MAX_SHEET_SLOTS - slots.length
            const rows = []
            for (let week = 1; rows.length + template.length <= room; week++) {
                const days = week * 7
                if (shiftDays(template[0].startsAt, days, sheet.timezone) > horizon) break

                for (const slot of template) {
                    rows.push({
                        sheetId: sheet.id,
                        startsAt: shiftDays(slot.startsAt, days, sheet.timezone),
                        endsAt: shiftDays(slot.endsAt, days, sheet.timezone),
                        capacity: slot.capacity,
                        note: slot.note,
                    })
                }
            }

            if (rows.length === 0) return

            const created = await prisma.signupSlot.createManyAndReturn({
                data: rows,
                skipDuplicates: true,
            })

            /* Appended in memory so the response carries them without a second read. New dates
             * have nobody on them by construction, which is what the empty claims stand for. */
            sheet.slots = [...slots, ...created.map((slot) => ({ ...slot, claims: [] }))]
        }),
    )
}

/* A group's sheets, newest first, paged by keyset.
 *
 * **The slots ride along, whole**, which looks like overfetching and is the opposite. Two things
 * need them and the second is why they are shipped rather than merely counted:
 *
 *  1. A collapsed row has to say "4 dates need people", which is a count over slots.
 *  2. **Opening a row must not be a request.** This surface is a list of accordions, so tapping
 *     is the whole interaction — a fetch per tap means a spinner on every one of them, on a
 *     screen whose shape invites tapping four times in a row. Shipping the slots lets the
 *     `sheet` store promote a loaded rota synchronously and refresh behind it, which is exactly
 *     what `post` does with the feed's cached row.
 *
 * The cost is bounded by the same window the detail read uses — a fortnight back, and forward
 * as far as the rota has been extended — against a page of rotas a parish counts on one hand.
 * If a group ever runs enough of them for this to matter, the fix is to bound the nested `take`,
 * not to go back to a request per tap. */
export const listSheets = async (viewer, { orgId, limit, cursor }) => {
    const membership = requireMembership(viewer, orgId)
    const canManage = membership.role === "ADMIN"

    const rows = await prisma.signupSheet.findMany({
        where: { orgId, deletedAt: null, ...keysetWhere(cursor) },
        orderBy: keysetOrder(),
        take: limit + 1,
        include: {
            slots: slotsWithClaims({
                where: { startsAt: slotWindow() },
                orderBy: { startsAt: "asc" },
            }),
        },
        relationLoadStrategy: "join",
    })

    /* Ongoing rotas keep themselves stocked. See `topUpRecurring` for why this is here and not
     * in a scheduled job — briefly, because a deploy with no cron must not quietly run out of
     * Saturdays. */
    await topUpRecurring(rows)

    return keysetPage(rows, limit, (sheet) =>
        projectSignupSheet(sheet, { viewerId: viewer.id, canManage }),
    )
}

/* One sheet, with its slots and everyone in them.
 *
 * 404 rather than 403 for a group the viewer is not in — `requireMembership`'s rule, applied
 * to a resource that names the group only after it has been read. The sheet is loaded first
 * because there is no other way to know which group to ask about; nothing is *returned* until
 * the membership check has run. */
export const getSheet = async (viewer, sheetId, { all = false } = {}) => {
    const sheet = await prisma.signupSheet.findFirst({
        where: { id: sheetId, deletedAt: null },
        include: {
            slots: slotsWithClaims({
                where: all ? {} : { startsAt: slotWindow() },
                orderBy: { startsAt: "asc" },
            }),
        },
        relationLoadStrategy: "join",
    })

    if (!sheet) throw notFound("Sign-up sheet not found.")
    const membership = requireMembership(viewer, sheet.orgId)

    return projectSignupSheet(sheet, {
        viewerId: viewer.id,
        canManage: membership.role === "ADMIN",
    })
}

/* The sheet a write is about, with the viewer's authority over it already resolved.
 *
 * Every mutation below starts here, so "load it, find its group, ask the one question" is
 * written once. It returns the row rather than a boolean because the callers need the group,
 * the timezone, or the status straight afterwards. */
const manageableSheet = async (viewer, sheetId) => {
    const sheet = await prisma.signupSheet.findFirst({ where: { id: sheetId, deletedAt: null } })
    if (!sheet) throw notFound("Sign-up sheet not found.")
    requireMembership(viewer, sheet.orgId, { role: "ADMIN" })
    return sheet
}

/* ---------------------------------------------------------------------------
 * Generating dates
 * ------------------------------------------------------------------------- */

const readTitle = (value) => {
    const title = String(value ?? "").trim().replace(/\s+/g, " ")
    if (!title) throw invalid("Give this sign-up sheet a name.", { title: "Required" })
    if (title.length > MAX_SIGNUP_TITLE_LENGTH) {
        throw invalid(`A name can be at most ${MAX_SIGNUP_TITLE_LENGTH} characters.`, {
            title: "Too long",
        })
    }
    return title
}

/* Trimmed to null rather than to "", for the reason `updateOrg` does it: an empty string is a
 * description that is present and blank, which renders as a surface with nothing in it. */
const readText = (value, max, field, label) => {
    const text = String(value ?? "").trim()
    if (text.length > max) {
        throw invalid(`${label} can be at most ${max} characters.`, { [field]: "Too long" })
    }
    return text || null
}

/* "2026-06-07" → its three numbers, or a refusal. Parsed by hand rather than through `Date`,
 * which accepts "2026-06-31" and quietly answers July. */
const readDate = (value, field) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim())
    if (!match) throw invalid("Pick a date.", { [field]: "Required" })

    const [year, month, day] = match.slice(1).map(Number)
    const probe = new Date(Date.UTC(year, month - 1, day))
    if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
        throw invalid("That date does not exist.", { [field]: "Invalid" })
    }
    return { year, month, day }
}

/* "16:00" → minutes past midnight. */
const readTime = (value, field) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim())
    if (!match) throw invalid("Pick a time.", { [field]: "Required" })

    const [hours, minutes] = match.slice(1).map(Number)
    if (hours > 23 || minutes > 59) throw invalid("That is not a time.", { [field]: "Invalid" })
    return hours * 60 + minutes
}

/* A schedule → the instants its slots start and end at.
 *
 * ── Wall clock in, instants out ──────────────────────────────────────────────
 *
 * The admin says "every Sunday at 11". Twelve Sundays cross a daylight-saving boundary, so
 * the dates are stepped as *dates* and the time of day is applied to each one in the sheet's
 * timezone — never by adding seven days to an instant, which walks an hour off on the Sunday
 * the clocks change and puts coffee hour at ten. This is the reason `SignupSheet.timezone`
 * exists at all; see its note in schema.prisma.
 *
 * ── One shape for three rotas ────────────────────────────────────────────────
 *
 * The two patterns choose the *days*; the window and the optional split then choose the slots
 * within each day, identically for both. That is what makes six two-hour shifts across a
 * festival weekend the same form as one 11:00-to-12:30 coffee hour, rather than a second mode
 * of it:
 *
 *   WEEKLY  + 11:00-12:30, no split          coffee hour, one slot a week
 *   WEEKLY  + 09:00-12:00, no split, cap 4   the soup kitchen
 *   DATES   + 16:00-22:00, split 2h, cap 4   the festival's parking lot, three shifts a day
 */
const generateSlots = (schedule, timezone) => {
    const pattern = schedule?.pattern ?? SIGNUP_PATTERNS.WEEKLY
    if (!Object.hasOwn(SIGNUP_PATTERNS, pattern)) {
        throw invalid("Pick how often this repeats.", { pattern: "Invalid" })
    }

    const start = readDate(schedule?.startDate, "startDate")
    const startMinutes = readTime(schedule?.startTime, "startTime")
    const endMinutes = readTime(schedule?.endTime, "endTime")

    /* An end *before* the start is read as the next morning, which is what "8pm to 1am" means
     * to the person typing it.
     *
     * Equal times are refused outright rather than being read as either nothing or a full day.
     * Both readings are wrong — nobody schedules a zero-length shift, and nobody expresses a
     * 24-hour one by typing the same time twice — and the length ceiling below would otherwise
     * catch it with a message about fourteen hours, which is not what the person did. */
    if (endMinutes === startMinutes) {
        throw invalid("A shift has to start and end at different times.", {
            endTime: "Same as the start",
        })
    }

    const spanMinutes = endMinutes > startMinutes
        ? endMinutes - startMinutes
        : endMinutes + 24 * 60 - startMinutes

    if (spanMinutes < MIN_SLOT_MINUTES) {
        throw invalid(`A slot has to be at least ${MIN_SLOT_MINUTES} minutes long.`, {
            endTime: "Too short",
        })
    }
    if (spanMinutes > MAX_SLOT_HOURS * 60) {
        throw invalid(`A slot can be at most ${MAX_SLOT_HOURS} hours long.`, {
            endTime: "Too long",
        })
    }

    const split = schedule?.splitMinutes == null ? null : Number(schedule.splitMinutes)
    if (split !== null && (!Number.isInteger(split) || split < MIN_SLOT_MINUTES)) {
        throw invalid("A shift has to be a whole number of minutes.", {
            splitMinutes: "Invalid",
        })
    }

    /* ── Which days ─────────────────────────────────────────────────────────── */
    const days = []
    const firstDay = Date.UTC(start.year, start.month - 1, start.day)

    if (pattern === SIGNUP_PATTERNS.WEEKLY) {
        const weekday = Number(schedule?.weekday)
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
            throw invalid("Pick a day of the week.", { weekday: "Required" })
        }
        const weeks = Number(schedule?.weeks ?? 12)
        if (!Number.isInteger(weeks) || weeks < 1) {
            throw invalid("Say how many weeks to put on the sheet.", { weeks: "Required" })
        }

        /* The first occurrence on or after the start date, so an admin who picks "Sunday" on a
         * Wednesday gets this coming Sunday rather than nothing. */
        const offset = (weekday - new Date(firstDay).getUTCDay() + 7) % 7
        for (let index = 0; index < weeks; index++) {
            days.push(firstDay + (offset + index * 7) * 86400000)
        }
    } else {
        const end = readDate(schedule?.endDate ?? schedule?.startDate, "endDate")
        const lastDay = Date.UTC(end.year, end.month - 1, end.day)
        if (lastDay < firstDay) {
            throw invalid("The last day has to come after the first.", { endDate: "Invalid" })
        }
        for (let day = firstDay; day <= lastDay; day += 86400000) days.push(day)
    }

    /* ── Which slots inside each day ────────────────────────────────────────── */
    const slots = []
    const lengths = []
    if (split === null || split >= spanMinutes) {
        lengths.push({ from: 0, length: spanMinutes })
    } else {
        for (let from = 0; from < spanMinutes; from += split) {
            /* A trailing remainder shorter than the split is kept, not dropped. Nine to twelve
             * in two-hour shifts is 9-11 and 11-12, and silently losing that last hour would
             * lose an hour of the soup kitchen nobody was told about. */
            lengths.push({ from, length: Math.min(split, spanMinutes - from) })
        }
    }

    for (const day of days) {
        for (const { from, length } of lengths) {
            const wallStart = day + (startMinutes + from) * 60000
            slots.push({
                startsAt: new Date(zonedToInstant(wallStart, timezone)),
                endsAt: new Date(zonedToInstant(wallStart + length * 60000, timezone)),
            })
        }
        if (slots.length > MAX_GENERATED_SLOTS) {
            throw invalid(
                `That is more than ${MAX_GENERATED_SLOTS} dates. Put fewer weeks on the sheet and extend it later.`,
                { weeks: "Too many" },
            )
        }
    }

    if (slots.length === 0) {
        throw invalid("That schedule produces no dates.", { startDate: "Invalid" })
    }
    return slots
}

const readCapacity = (value) => {
    const capacity = Number(value ?? 1)
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_SLOT_CAPACITY) {
        throw invalid(`A slot needs room for 1 to ${MAX_SLOT_CAPACITY} people.`, {
            capacity: "Invalid",
        })
    }
    return capacity
}

/* An IANA zone name, checked against the platform rather than against a list.
 *
 * `Intl.DateTimeFormat` throws on a name it does not know, which is both the cheapest check
 * available and the only one that agrees with what `zonedToInstant` will actually do with the
 * value. Falls back to UTC rather than refusing: the client sends its own
 * `resolvedOptions().timeZone`, so a rejection here would be a sheet that cannot be created on
 * a device with an unusual locale, which is nobody's idea of a validation error. */
const readTimezone = (value) => {
    const zone = String(value ?? "").trim()
    if (!zone) return "UTC"
    try {
        new Intl.DateTimeFormat("en-CA", { timeZone: zone })
        return zone
    } catch {
        return "UTC"
    }
}

/* ---------------------------------------------------------------------------
 * Writing — the sheet
 * ------------------------------------------------------------------------- */

/* Publishes a rota into a group. Admin of that group, like a post.
 *
 * The sheet and its dates are written in one transaction, for the reason `createOrg` writes
 * its membership alongside its group: a sheet with no dates is a surface with nothing on it
 * and nothing to repair it with, so a partial write here does not degrade, it strands.
 *
 * ── And the parish is told ───────────────────────────────────────────────────
 *
 * A rota nobody knows about gets no volunteers, so publishing one notifies the group exactly as
 * publishing a post does — a fan-out over every approved member but the admin. The rows go in
 * the same transaction as the sheet (a notification about a rota that then failed to be created
 * is worse than none), and the push follows the commit and is not awaited, which is the rule the
 * whole of `notifications.service.js` is built on.
 *
 * The recipients are read *outside* the transaction, on the same grounds `publishPost` reads
 * them outside its own: somebody admitted in the same second either makes this list or does not,
 * and neither answer is wrong, so it is not worth holding a connection open for. */
export const createSheet = async (
    viewer,
    { orgId, title, description, capacity, schedule } = {},
) => {
    requireMembership(viewer, orgId, { role: "ADMIN" })

    const timezone = readTimezone(schedule?.timezone)
    const sheetTitle = readTitle(title)
    const text = readText(description, MAX_SIGNUP_DESCRIPTION_LENGTH, "description", "A description")
    const slotCapacity = readCapacity(capacity)

    /* An ongoing rota only makes sense weekly — a span of dates has an end by definition, which
     * is what makes it the other kind. The generator is given a horizon's worth of weeks rather
     * than a number the admin typed, and `topUpRecurring` keeps it there from then on. */
    const repeats = Boolean(schedule?.repeats) && schedule?.pattern === SIGNUP_PATTERNS.WEEKLY
    const slots = generateSlots(
        repeats
            ? { ...schedule, weeks: Math.ceil(SIGNUP_HORIZON_DAYS / 7) }
            : schedule,
        timezone,
    )

    const recipients = await newPostRecipients(orgId, viewer.id)

    /* Interactive, unlike every other write here, and for the documented reason: the
     * notifications need the id of the sheet created in the same transaction, which the array
     * form cannot carry between statements. Same dependency `notifyNewPost` earns it for. */
    const sheet = await prisma.$transaction(async (tx) => {
        const created = await tx.signupSheet.create({
            data: {
                orgId,
                title: sheetTitle,
                description: text,
                timezone,
                repeats,
                createdById: viewer.id,
                slots: {
                    create: slots.map((slot) => ({ ...slot, capacity: slotCapacity })),
                },
            },
            include: { slots: slotsWithClaims({ orderBy: { startsAt: "asc" } }) },
        })

        await notifySignupPublished(tx, {
            recipients,
            actorId: viewer.id,
            sheetId: created.id,
        })

        return created
    })

    pushSignupPublished({
        recipients,
        orgName: membershipIn(viewer, orgId)?.org?.name ?? null,
        title: sheet.title,
        sheetId: sheet.id,
    })

    return projectSignupSheet(sheet, { viewerId: viewer.id, canManage: true })
}

/* Title, description, and whether the rota is still taking people.
 *
 * Every field is optional and absent means "leave alone", so the form can send only what
 * changed — the same partial-update rule `PATCH /api/me` and `updateOrg` follow. Closing is
 * here rather than in a `DELETE` because it is not deletion: a closed sheet still says who
 * did what, which is most of what a parish keeps a rota for. */
export const updateSheet = async (
    viewer,
    sheetId,
    { title, description, status, calendarTitle } = {},
) => {
    const sheet = await manageableSheet(viewer, sheetId)

    const data = {}
    if (title !== undefined) data.title = readTitle(title)
    if (description !== undefined) {
        data.description = readText(
            description, MAX_SIGNUP_DESCRIPTION_LENGTH, "description", "A description",
        )
    }
    if (status !== undefined) {
        if (!Object.hasOwn(SIGNUP_STATUS, status)) {
            throw invalid("That is not a sign-up status.", { status: "Invalid" })
        }
        data.status = status
    }
    if (calendarTitle !== undefined) {
        /* Cleared back to null, which restores the automatic behaviour: match on the sheet's
         * own title. Distinguishable from absence, because `undefined` is what Prisma ignores. */
        data.calendarTitle = readText(
            calendarTitle, MAX_SIGNUP_TITLE_LENGTH, "calendarTitle", "A calendar title",
        )
    }
    if (Object.keys(data).length === 0) throw invalid("Nothing to update.", { title: "Required" })

    const updated = await prisma.signupSheet.update({
        where: { id: sheet.id },
        data,
        include: {
            slots: slotsWithClaims({
                where: { startsAt: slotWindow() },
                orderBy: { startsAt: "asc" },
            }),
        },
    })

    return projectSignupSheet(updated, { viewerId: viewer.id, canManage: true })
}

/* Retires a sheet. Soft, like a post: the record of who volunteered survives, and every read
 * already filters on `deletedAt`.
 *
 * **Deleting is for a rota that should never have been published**; a rota that has simply
 * finished is closed, which keeps it readable. The surface offers closing first for that
 * reason, and this behind a confirmation. */
export const deleteSheet = async (viewer, sheetId) => {
    const sheet = await manageableSheet(viewer, sheetId)
    await prisma.signupSheet.update({
        where: { id: sheet.id },
        data: { deletedAt: new Date() },
    })
}

/* Adds more dates to a rota that has run out — the same generator, run again.
 *
 * `skipDuplicates` against `@@unique([sheetId, startsAt])` is what makes this safe to repeat:
 * an admin who taps Extend twice, or who overlaps the range they already added, gets the
 * dates that were missing and nothing else. Without that constraint the same tap would put
 * two coffee hours on every Sunday and leave nobody able to say which one people had signed
 * up for. */
export const addSlots = async (viewer, sheetId, { capacity, schedule } = {}) => {
    const sheet = await manageableSheet(viewer, sheetId)

    const slotCapacity = readCapacity(capacity)
    const slots = generateSlots(schedule, sheet.timezone)

    const existing = await prisma.signupSlot.count({ where: { sheetId: sheet.id } })
    if (existing + slots.length > MAX_SHEET_SLOTS) {
        throw invalid(
            `A sheet can hold ${MAX_SHEET_SLOTS} dates. Close this one and start a new sheet.`,
            { weeks: "Too many" },
        )
    }

    await prisma.signupSlot.createMany({
        data: slots.map((slot) => ({ ...slot, sheetId: sheet.id, capacity: slotCapacity })),
        skipDuplicates: true,
    })

    return getSheet(viewer, sheet.id)
}

/* ---------------------------------------------------------------------------
 * Writing — one date
 * ------------------------------------------------------------------------- */

/* The slot a write is about, with the viewer's role in its group resolved.
 *
 * Two joins deep — slot → sheet → org — and the membership still costs no query, because it
 * is read from the snapshot `requireViewer` loaded. */
const slotWithRole = async (viewer, slotId, { role } = {}) => {
    const slot = await prisma.signupSlot.findUnique({
        where: { id: slotId },
        include: { sheet: true, ...claimInclude },
    })
    if (!slot || slot.sheet.deletedAt) throw notFound("That date is not on the sheet.")

    const membership = requireMembership(viewer, slot.sheet.orgId, { role })
    return { slot, canManage: membership.role === "ADMIN" }
}

/* One date's capacity, note, or cancellation.
 *
 * **Cancelling notifies everybody who had signed up**, and that is the whole reason cancelling
 * is a state rather than a delete. A volunteer who turns up to a soup kitchen that was called
 * off two weeks ago has been failed by the app, not inconvenienced by it — so the write and
 * the notifications go in one transaction, and the pushes follow the commit. */
export const updateSlot = async (viewer, slotId, { capacity, note, canceled } = {}) => {
    const { slot } = await slotWithRole(viewer, slotId, { role: "ADMIN" })

    const data = {}
    if (capacity !== undefined) {
        const next = readCapacity(capacity)
        /* Cutting capacity below what is already claimed is refused rather than silently
         * dropping the last people to sign up. The admin's real intent is to remove somebody
         * specific, and the roster on the slot is where they can. */
        if (next < slot.claims.length) {
            throw conflict(
                `${slot.claims.length} people have already signed up for this date. Take somebody off it first.`,
            )
        }
        data.capacity = next
    }
    if (note !== undefined) {
        data.note = readText(note, MAX_SLOT_NOTE_LENGTH, "note", "A note")
    }
    if (canceled !== undefined) {
        data.canceledAt = canceled ? (slot.canceledAt ?? new Date()) : null
    }
    if (Object.keys(data).length === 0) {
        throw invalid("Nothing to update.", { capacity: "Required" })
    }

    const cancelling = data.canceledAt != null && slot.canceledAt === null
    const recipients = cancelling
        ? slot.claims.map((claim) => claim.profileId).filter((id) => id !== viewer.id)
        : []

    await prisma.$transaction([
        prisma.signupSlot.update({ where: { id: slot.id }, data }),
        /* The pending nudges for a date that is not happening. Deleted rather than left for
         * the sender to filter, so "why did I get reminded about a cancelled shift" cannot
         * depend on a condition somebody forgets to add to one query. */
        ...(cancelling
            ? [prisma.signupReminder.deleteMany({
                  where: { sentAt: null, claim: { slotId: slot.id } },
              })]
            : []),
        ...notifySignupCanceled({ recipients, actorId: viewer.id, slot }),
    ])

    if (cancelling) {
        pushSignupCanceled({
            recipients,
            title: slot.sheet.title,
            sheetId: slot.sheetId,
            when: describeSlot(slot, slot.sheet.timezone),
        })
    }

    const fresh = await prisma.signupSlot.findUnique({
        where: { id: slot.id },
        include: claimInclude,
    })
    return projectSignupSlot(fresh, { viewerId: viewer.id, canManage: true })
}

/* Removes a date outright — for one that should not have been generated at all.
 *
 * **Refused once anybody has signed up.** Deleting it then would drop those people without
 * telling them anything, which is precisely the failure `canceledAt` exists to prevent; the
 * admin is pointed at cancelling instead, which keeps the row, notifies the volunteers, and
 * leaves the date visibly struck through. */
export const deleteSlot = async (viewer, slotId) => {
    const { slot } = await slotWithRole(viewer, slotId, { role: "ADMIN" })

    if (slot.claims.length > 0) {
        throw conflict(
            "People have signed up for this date. Cancel it instead, so they are told.",
        )
    }
    await prisma.signupSlot.delete({ where: { id: slot.id } })
}

/* "Sunday 7 June at 11 AM" — a slot, as a push banner and a notification line say it.
 *
 * Formatted **in the sheet's own timezone**, which is the one place in the app that matters
 * rather than the reader's. A notification is composed on the server and stored, so there is
 * no reader in the room when the words are chosen; the parish's clock is the only answer that
 * is right for everybody who will read it, including the parishioner reading it from an
 * airport in another one.
 *
 * `Intl` rather than the hand-built formatters in `lib/utils.js`, and the difference is that
 * those exist to avoid a hydration mismatch between a build machine and a browser. Nothing
 * here is rendered; it is a string written into a row. */
const describeSlot = (slot, timezone) => {
    try {
        return new Intl.DateTimeFormat("en-US", {
            timeZone: timezone || "UTC",
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }).format(slot.startsAt)
    } catch {
        return slot.startsAt.toISOString().slice(0, 16).replace("T", " ")
    }
}

/* ---------------------------------------------------------------------------
 * Writing — a place on a rota
 * ------------------------------------------------------------------------- */

/* The reminders one claim is owed: the offsets that have not already gone by.
 *
 * A slot two days out gets the day-before nudge and not the week-before one, which is why
 * this filters rather than writing both and letting the sender skip the stale one — a
 * reminder row whose `sendAt` is in the past is a row the sender would fire immediately. */
const remindersFor = (startsAt, wanted) => {
    if (!wanted) return []
    const now = Date.now()
    return SIGNUP_REMINDER_OFFSETS
        .map((offset) => new Date(startsAt.getTime() - offset))
        .filter((sendAt) => sendAt.getTime() > now)
        .map((sendAt) => ({ sendAt }))
}

/* Takes a place on one date.
 *
 * Member of the group, and the checks are in the order a person would ask them: is this rota
 * still open, is this date still happening, has it already been, is there room.
 *
 * ── Why this one is an interactive transaction ───────────────────────────────
 *
 * The insert may only happen if this request is the one that found room, and "is there room"
 * is a count of rows in the table being inserted into. Under READ COMMITTED two people taking
 * the last place both read three-of-four and both insert, so the slot row is locked `FOR
 * UPDATE` first and the second request waits for the first to commit before it counts. That
 * is the same justification `deleteComment` carries — a statement that depends on a previous
 * statement's result — and it is affordable here because signing up is a once-a-month act
 * rather than the hottest write in the app.
 *
 * The unique key on `(slotId, profileId)` still does the other half: a double tap is a `P2002`
 * and is reported as "you are already on this date", not as a server fault. */
export const claimSlot = async (viewer, slotId, { onBehalfOf, note, remind = true } = {}) => {
    const { slot, canManage } = await slotWithRole(viewer, slotId)

    if (slot.sheet.status !== SIGNUP_STATUS.OPEN) {
        throw conflict("This sign-up sheet is closed.")
    }
    if (slot.canceledAt) throw conflict("This date has been cancelled.")
    if (slot.endsAt.getTime() < Date.now()) throw conflict("This date has already been.")

    const standingFor = readText(onBehalfOf, MAX_ON_BEHALF_OF_LENGTH, "onBehalfOf", "A name")
    const comment = readText(note, MAX_CLAIM_NOTE_LENGTH, "note", "A note")

    try {
        await prisma.$transaction(async (tx) => {
            /* The lock. `slot.id` is a cuid this function already holds, so it is
             * parameterized rather than interpolated, and the statement reads one row by
             * primary key. */
            await tx.$queryRaw`SELECT id FROM signup_slot WHERE id = ${slot.id} FOR UPDATE`

            const taken = await tx.signupClaim.count({ where: { slotId: slot.id } })
            if (taken >= slot.capacity) {
                throw conflict("This date filled up. Try another one.")
            }

            await tx.signupClaim.create({
                data: {
                    slotId: slot.id,
                    profileId: viewer.id,
                    onBehalfOf: standingFor,
                    note: comment,
                    reminders: { create: remindersFor(slot.startsAt, remind) },
                },
            })
        })
    } catch (error) {
        if (error?.code === "P2002") throw conflict("You are already signed up for this date.")
        throw error
    }

    const fresh = await prisma.signupSlot.findUnique({
        where: { id: slot.id },
        include: claimInclude,
    })
    return projectSignupSlot(fresh, { viewerId: viewer.id, canManage })
}

/* Gives up a place — your own, or, for an admin of the group, somebody else's.
 *
 * **Two rules, deliberately not merged**, exactly as deleting a comment is: a person owns what
 * they signed up for, and an admin manages the rota they published. The second is per-group,
 * resolved from the membership that authorized reading the sheet, so administering a diocese
 * grants nothing over a parish's coffee hour.
 *
 * The reminders go with it by cascade — there is nothing left to be reminded about. */
export const releaseClaim = async (viewer, claimId) => {
    const claim = await prisma.signupClaim.findUnique({
        where: { id: claimId },
        include: { slot: { include: { sheet: true } } },
    })
    if (!claim || claim.slot.sheet.deletedAt) throw notFound("That sign-up is not on the sheet.")

    const membership = membershipIn(viewer, claim.slot.sheet.orgId)
    if (!membership || membership.status !== "APPROVED") {
        throw notFound("That sign-up is not on the sheet.")
    }
    if (claim.profileId !== viewer.id && membership.role !== "ADMIN") {
        throw forbidden("You can only give up your own sign-up.")
    }

    await prisma.signupClaim.delete({ where: { id: claim.id } })

    const fresh = await prisma.signupSlot.findUnique({
        where: { id: claim.slotId },
        include: claimInclude,
    })
    return projectSignupSlot(fresh, {
        viewerId: viewer.id,
        canManage: membership.role === "ADMIN",
    })
}

/* ---------------------------------------------------------------------------
 * Sending the reminders
 * ------------------------------------------------------------------------- */

/* How many reminders one run will send. A ceiling rather than a page: the caller is a cron,
 * and a run that finds more than this has a backlog, which the next run five minutes later
 * clears. Bounding it is what keeps a schedule that has been off for a week from turning its
 * first run back on into one enormous transaction. */
const REMINDER_BATCH = 200

/* How often a lazy sweep will actually do anything, per process.
 *
 * Five minutes: short enough that a nudge scheduled for a week out and delivered five minutes
 * late is delivered on time by any measure a person applies to it, and long enough that the
 * check costs one indexed query a minute however many people are using the app. */
const REMINDER_SWEEP_MS = 5 * 60 * 1000

/* How late a reminder may be and still be worth sending. A nudge for a shift that started an
 * hour ago is not a reminder, it is a reproach — so a run that has been down for two days
 * skips what it missed rather than delivering a pile of apologies. */
const REMINDER_GRACE_MS = 6 * 60 * 60 * 1000

/* Sends every reminder that has come due, and marks it sent.
 *
 * ── Idempotent by construction ───────────────────────────────────────────────
 *
 * The caller is a schedule, and a schedule fires twice sooner or later — two hosts, a retry, a
 * person running it by hand while cron does the same. So the rows are **claimed before they
 * are used**: `updateMany` stamps `sentAt` on everything due, and the run then works from the
 * ids it stamped. A second run overlapping the first finds nothing due, because the first has
 * already claimed the rows; the loser sends nothing rather than sending everything twice.
 *
 * Stamping *before* the notification rows are written is the deliberate direction. It means a
 * crash between the two loses a reminder rather than repeating it, and that is the right way
 * round: a nudge that does not arrive is a nudge, and one that arrives twice is the app being
 * broken in a way the reader can see.
 *
 * ── The push is not the notification ─────────────────────────────────────────
 *
 * The rows land in the panel whatever FCM does, exactly as everywhere else in this app. The
 * pushes are fired after the transaction commits and are not awaited, so a cron run does not
 * hang on Google.
 */
export const sendDueReminders = async ({ now = new Date() } = {}) => {
    const due = await prisma.signupReminder.findMany({
        where: {
            sentAt: null,
            sendAt: { lte: now, gte: new Date(now.getTime() - REMINDER_GRACE_MS) },
            /* Nothing for a date that has been called off, a rota that has been retired, or a
             * shift that has already been. The first is belt to `updateSlot`'s braces, which
             * deletes pending reminders when it cancels; the other two have no such hook, since
             * closing a sheet is not supposed to un-tell the people already on it. */
            claim: {
                slot: {
                    canceledAt: null,
                    startsAt: { gte: now },
                    sheet: { deletedAt: null },
                },
            },
        },
        orderBy: { sendAt: "asc" },
        take: REMINDER_BATCH,
        include: {
            claim: {
                include: {
                    slot: { include: { sheet: { select: { id: true, title: true, timezone: true } } } },
                },
            },
        },
        relationLoadStrategy: "join",
    })

    /* Everything overdue past the grace window, retired rather than sent. Without this they
     * are re-read by every run forever and the query above gets slower every week.
     *
     * A function rather than a value, because a Prisma operation is lazy: built once and used
     * on two paths, it would be one object that runs in whichever branch got to it — which
     * works today and is exactly the shape that silently stops working when a third branch is
     * added. */
    const expireOverdue = () =>
        prisma.signupReminder.updateMany({
            where: { sentAt: null, sendAt: { lt: new Date(now.getTime() - REMINDER_GRACE_MS) } },
            data: { sentAt: now },
        })

    if (due.length === 0) {
        await expireOverdue()
        return { sent: 0 }
    }

    const ids = due.map((reminder) => reminder.id)

    const [claimed] = await prisma.$transaction([
        /* The claim. `sentAt: null` in the `where` is what makes it one: only the run that
         * finds the row unsent gets to count it, so two runs racing cannot both proceed. */
        prisma.signupReminder.updateMany({
            where: { id: { in: ids }, sentAt: null },
            data: { sentAt: now },
        }),
        notifySignupReminder(due),
        expireOverdue(),
    ].filter(Boolean))

    /* Nothing was claimed, so another run got there first and has already sent these. */
    if (claimed.count === 0) return { sent: 0 }

    for (const reminder of due) {
        const { slot } = reminder.claim
        pushSignupReminder({
            recipientId: reminder.claim.profileId,
            title: slot.sheet.title,
            sheetId: slot.sheetId,
            when: describeSlot(slot, slot.sheet.timezone),
        })
    }

    return { sent: due.length }
}

/* ---------------------------------------------------------------------------
 * Sending them without a schedule
 * ------------------------------------------------------------------------- */

let lastSweep = 0

/* Sends whatever is due, at most once every `REMINDER_SWEEP_MS`, without blocking the caller.
 *
 * ── Why reminders do not depend on a cron ────────────────────────────────────
 *
 * `POST /api/signups/reminders` is the punctual path and wants a schedule behind it. This is
 * the one that means a deploy with no schedule still *works*, and it exists for exactly the
 * reason `topUpRecurring` runs inside a read: a feature that quietly does nothing until
 * somebody finds an environment variable is a feature that is broken for everybody who did not.
 * A rota that runs out of Saturdays and a reminder that never arrives are the same failure, so
 * they get the same answer.
 *
 * ── Why it hangs off the bell ────────────────────────────────────────────────
 *
 * The caller is `GET /api/notifications/unread`, which is the most frequently asked and cheapest
 * thing in the app: every client asks it on boot, on every return to the foreground, and — where
 * push cannot reach — every thirty seconds. That is a clock, near enough, and it is one this app
 * already pays for. Anything less frequent would mean a nudge for tomorrow arriving whenever
 * somebody next opened the sign-ups tab.
 *
 * ── What keeps it cheap ──────────────────────────────────────────────────────
 *
 * The throttle, which is a timestamp comparison and nothing else on the overwhelming majority of
 * calls. Past it, the work is one index-only scan of `(sent_at, send_at)` that almost always
 * returns nothing. The throttle is per process, so several instances sweep independently — which
 * is harmless, because `sendDueReminders` claims its rows with a conditional update before it
 * uses them and two sweeps racing cannot nudge anybody twice.
 *
 * **Never awaited, and it swallows everything.** The bell's tally must not get slower, or fail,
 * because a reminder could not be delivered — the same rule every push in this app follows. */
export const sweepDueReminders = () => {
    const now = Date.now()
    if (now - lastSweep < REMINDER_SWEEP_MS) return

    /* Stamped before the work rather than after it, so a slow sweep does not let the next
     * request start a second one alongside it. */
    lastSweep = now

    sendDueReminders().catch((error) => {
        console.error("[reminders] sweep failed", error)
    })
}
