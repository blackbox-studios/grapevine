import "server-only"

import { MembershipStatus, OrgRole, Prisma, Vocation } from "@prisma/client"

import {
    HANDLE_MAX,
    HANDLE_MIN,
    HANDLE_PATTERN,
    MAX_CHRISTIAN_NAME_LENGTH,
    UPLOAD_PURPOSES,
} from "@/lib/constants"
import { prisma } from "@/lib/db"
import { requireMembership } from "@/lib/server/auth"
import { AppError, invalid, notFound } from "@/lib/server/errors"
import { projectViewer } from "@/lib/server/projections"
import { isOwnedUrl } from "@/lib/server/storage"
import { findAuthUserByEmail, supabaseAdmin } from "@/lib/server/supabase"
import { uploadPrefix } from "@/lib/server/uploads.service"

/* The viewer's own identity, the parish roster, and admission to the parish.
 *
 * `GET /api/me` is the app's session probe: the client holds a Supabase token, but a
 * token only proves *who* someone is, not what this application knows about them. This is
 * what turns a verified token into a viewer with a name, a vocation, a role, and an
 * access state — and it is the call that decides whether the app opens at all.
 *
 * It also fills the gap the static export leaves. With no server rendering the first
 * paint, there is nothing to embed a bootstrapped user into the HTML; the client has to
 * ask. That single round trip on boot is the whole cost of having no middleware. */

/* How stale `lastSeenAt` may get before it is rewritten.
 *
 * The column answers "has this person ever signed in", which the roster shows — that only
 * needs to flip from null once. Writing it on every `/api/me` would be a database write
 * per app boot for information nobody reads at that resolution, so it is throttled. */
const LAST_SEEN_THROTTLE_MS = 10 * 60 * 1000

/* The viewer's own memberships are not queried here at all — `requireViewer` loads them
 * with the profile (see `viewerMemberships` in `lib/server/auth.js`), every status, with
 * each organization, already ordered APPROVED-first. Nothing in this file should ask the
 * database for them again: the viewer probe and every admin check read that one snapshot.
 *
 * The roster below is a different question — *other* people's memberships in one group —
 * and that one is still a query. */

/* Records that the viewer was here, at most once per throttle window.
 *
 * Fire-and-forget: a failed heartbeat must never fail the request it rode in on, because
 * the thing it records is a nicety and the thing it would break is sign-in. */
const touchProfile = (profile) => {
    const last = profile.lastSeenAt?.getTime() ?? 0
    if (Date.now() - last < LAST_SEEN_THROTTLE_MS) return

    prisma.profile
        .update({ where: { id: profile.id }, data: { lastSeenAt: new Date() } })
        .catch(() => {})
}

/* The viewer's follow tallies, as an `_count` shaped for `projectViewer`.
 *
 * **Not folded into `requireViewer`.** That runs on every single request, and two tallies
 * nothing in the request path reads would be a permanent tax to serve one screen. This is one
 * extra statement on `/api/me` alone — a boot-and-resume call — and every *write* gets them
 * free, because there the `_count` rides along with the `update` that was happening anyway. */
const followCounts = { select: { _count: { select: { followers: true, following: true } } } }

/* The signed-in viewer, with every group they belong to and why they may or may not be
 * here. */
export const getViewer = async (viewer) => {
    /* `requireViewer` already loaded the profile and its memberships — every status, with its
     * organization, in the order this needs — so all that is left to ask for is the tallies. */
    touchProfile(viewer)
    const counts = await prisma.profile.findUnique({ where: { id: viewer.id }, ...followCounts })
    return projectViewer({ ...viewer, _count: counts?._count }, viewer.memberships)
}

/* A client string checked against a generated Prisma enum, or `undefined` if absent.
 *
 * Validated against the enum object rather than a copied list so it cannot drift from the
 * schema. Without this an unknown value reaches Prisma and surfaces as a 500, where the
 * contract promises a 400. */
const readEnum = (values, value, field) => {
    if (value == null) return undefined
    if (!Object.hasOwn(values, value)) {
        throw invalid(`That ${field} is not a valid option.`, { [field]: "Invalid" })
    }
    return value
}

/* One name part, validated.
 *
 * Length-bounded rather than pattern-matched, and that restraint is deliberate: any regex
 * narrow enough to be worth writing rejects somebody's actual name. Cyrillic, apostrophes,
 * hyphens, and spaces inside a single part are all ordinary here. The only real failures to
 * catch are empty and absurd. */
const readName = (value, field, label) => {
    const name = String(value ?? "").trim().replace(/\s+/g, " ")
    if (!name) throw invalid(`Enter your ${label}.`, { [field]: "Required" })
    if (name.length > 80) {
        throw invalid(`That ${label} is too long.`, { [field]: "Too long" })
    }
    return name
}

/* The same rule, applied only if the caller mentioned the field.
 *
 * `undefined` passes straight through; an empty string does **not** — a name is not clearable
 * the way a Christian name is, because every byline in the app falls back to the handle and a
 * person who blanked their name would silently become "@j.smith" everywhere. So the partial
 * update can leave a name alone but never erase one. */
const readNameIfGiven = (value, field, label) =>
    value === undefined ? undefined : readName(value, field, label)

/* A handle as it would be stored, or a validation failure explaining why not.
 *
 * **The server's answer is the one that counts.** `normalizeHandleInput` in `lib/name.js`
 * shapes what the viewer types so the field shows the value that will be saved, but it runs
 * on a client and is therefore a convenience, not a rule — this is the check that decides.
 * The two use the same character set on purpose; keep them in step. */
const readHandle = (value) => {
    const handle = String(value ?? "").trim().replace(/^@+/, "").toLowerCase()

    if (!handle) throw invalid("Choose a handle.", { handle: "Required" })
    if (handle.length < HANDLE_MIN) {
        throw invalid(`A handle needs at least ${HANDLE_MIN} characters.`, {
            handle: "Too short",
        })
    }
    if (handle.length > HANDLE_MAX) {
        throw invalid(`A handle can be at most ${HANDLE_MAX} characters.`, {
            handle: "Too long",
        })
    }
    if (!HANDLE_PATTERN.test(handle)) {
        throw invalid(
            "A handle can use letters, numbers, dots, underscores and hyphens, and must start and end with a letter or number.",
            { handle: "Invalid" },
        )
    }
    return handle
}

/* A birthday as a `@db.Date`, or a validation failure.
 *
 * Bounds rather than a bare is-this-a-date check, because the failures worth catching are a
 * typo'd year and a future date — "1837" and "next Tuesday" both parse perfectly. */
const readBirthday = (value) => {
    const text = String(value ?? "").trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw invalid("Enter your date of birth.", { birthday: "Required" })
    }

    /* Parsed as UTC midnight, which is what `@db.Date` stores. Building it with
     * `new Date("YYYY-MM-DD")` rather than local parts is deliberate: local parsing in a
     * negative-offset timezone lands on the previous day. */
    const date = new Date(`${text}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime())) {
        throw invalid("That date does not look right.", { birthday: "Invalid" })
    }
    if (date > new Date()) {
        throw invalid("A date of birth cannot be in the future.", { birthday: "Invalid" })
    }
    if (date.getUTCFullYear() < 1900) {
        throw invalid("That date does not look right.", { birthday: "Invalid" })
    }
    return date
}

/* An optional free-text field: the trimmed value, or `null` to clear it.
 *
 * `null` and "absent" are different answers here and both have to be expressible — Settings
 * lets somebody who typed the wrong saint's name empty the box again, and an empty string is
 * how a form says that. `undefined` means the caller did not mention the field, which is what
 * keeps a partial update from wiping what it did not send. */
const readOptionalText = (value, field, label, max = MAX_CHRISTIAN_NAME_LENGTH) => {
    if (value === undefined) return undefined
    const text = String(value ?? "").trim().replace(/\s+/g, " ")
    if (!text) return null
    if (text.length > max) throw invalid(`That ${label} is too long.`, { [field]: "Too long" })
    return text
}

/* A name day as the pair of columns it is stored in, or a validation failure.
 *
 * **`MM-DD` on the wire, two integers in the database, and no year anywhere.** A name day is a
 * feast that recurs, so a year would be a value invented here for the column's benefit and
 * then ignored by every reader — see the `nameDayMonth` note in `prisma/schema.prisma`.
 *
 * The day is bounded by the length of the month it is in, with February taken as 29: a name
 * day is not anchored to a year, so there is no leap year to consult, and St Cassian's feast
 * on the 29th is a real one that a 28-day ceiling would refuse.
 *
 * Answers `{ nameDayMonth, nameDayDay }` so it drops straight into a Prisma `data`, and both
 * are null together when cleared — nothing represents half a date. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const readNameDay = (value) => {
    if (value === undefined) return undefined
    const text = String(value ?? "").trim()
    if (!text) return { nameDayMonth: null, nameDayDay: null }

    const match = /^(\d{2})-(\d{2})$/.exec(text)
    if (!match) throw invalid("Enter a name day.", { nameDay: "Invalid" })

    const month = Number(match[1])
    const day = Number(match[2])
    if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
        throw invalid("That is not a date in the calendar.", { nameDay: "Invalid" })
    }

    return { nameDayMonth: month, nameDayDay: day }
}

/* An ordination date as a `@db.Date`, or null to clear it.
 *
 * Bounded the same way a birthday is and for the same reasons — the failures worth catching
 * are a typo'd year and a future date. There is no check that the person holds a rank that can
 * be ordained: `CLERGY_VOCATIONS` decides who is *asked*, and a reader ordained a deacon next
 * month must be able to record it without waiting for that list to be consulted again. */
const readOrdinationDate = (value) => {
    if (value === undefined) return undefined
    const text = String(value ?? "").trim()
    if (!text) return null

    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw invalid("Enter an ordination date.", { ordinationDate: "Invalid" })
    }

    /* UTC midnight, matching `@db.Date` — see `readBirthday` for why local parsing shifts the
     * day west of Greenwich. */
    const date = new Date(`${text}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime())) {
        throw invalid("That date does not look right.", { ordinationDate: "Invalid" })
    }
    if (date > new Date()) {
        throw invalid("An ordination date cannot be in the future.", {
            ordinationDate: "Invalid",
        })
    }
    if (date.getUTCFullYear() < 1900) {
        throw invalid("That date does not look right.", { ordinationDate: "Invalid" })
    }
    return date
}

/* A profile picture's URL, proven to be an object this viewer was granted permission to upload.
 *
 * **The URL is checked, not trusted, and this is the whole security of it.** It arrives from the
 * client and is written verbatim, so unchecked a picture could point anywhere: at an off-site
 * image the feed would render as a parishioner's face, at a tracking pixel reporting every
 * reader who scrolls past a post they commented on, or at another person's object.
 * `POST /api/uploads` authorized this viewer for the `avatars/<their own id>/` folder before it
 * minted a path there — so the folder an object sits in *is* the record that the upload was
 * earned, and checking it carries that authorization forward to the write it was granted for.
 * The same rule `createPost` applies to a post's media.
 *
 * A replaced picture is left in storage on purpose: deleting it would add a second failure mode
 * to a write whose whole job is to be instant, and one that succeeded against the wrong key
 * would destroy a picture still in use. A sweep belongs in a job.
 *
 * Unlike the other optional readers this one refuses to clear: there is no "remove my picture"
 * affordance, and an empty string reaching here means a picker that failed rather than a
 * deliberate erasure. */
const readAvatarUrl = (viewer, value) => {
    if (value === undefined) return undefined

    const url = String(value ?? "").trim()
    if (!url) throw invalid("A picture is required.", { avatar: "Required" })

    if (!isOwnedUrl(url, { prefix: uploadPrefix(UPLOAD_PURPOSES.AVATAR), ownerId: viewer.id })) {
        throw invalid("A profile picture must be uploaded through Grapevine.", {
            avatar: "Unrecognized file",
        })
    }
    return url
}

/* Is this @handle free?
 *
 * Answers the live check on the handle step. The viewer's *own* current handle counts as
 * available — otherwise someone who walks back to the step is told the handle they are
 * already wearing is taken, and cannot move forward without changing it.
 *
 * This is advisory. Between this answer and the write, somebody else can take the name, and
 * only the unique constraint in `completeOnboarding` settles it. Behind `requireViewer`,
 * like everything else here, so it is not an open handle-enumeration endpoint — though a
 * signed-in member probing names is not a threat worth designing against, since handles are
 * public the moment their owner comments. */
export const checkHandle = async (viewer, value) => {
    let handle
    try {
        handle = readHandle(value)
    } catch (error) {
        /* An invalid handle is not "taken" — it is not a handle at all. Reported as
         * unavailable with the reason, so the step can say why without a second shape. */
        return { handle: String(value ?? ""), available: false, reason: error.message }
    }

    if (handle === viewer.handle) return { handle, available: true, reason: null }

    const taken = await prisma.profile.findUnique({
        where: { handle },
        select: { id: true },
    })

    return {
        handle,
        available: !taken,
        reason: taken ? "That handle is already taken." : null,
    }
}

/* Completes first-run orientation: the viewer's name, the @handle they chose, their
 * birthday, and — for the people it applies to — their Christian name, name day, and
 * ordination date.
 *
 * **One write, or none.** Stamping `onboardedAt` is what lets the viewer past the welcome
 * gate, so it is written *with* the answers — a name saved without the stamp would ask
 * again forever, and a stamp without the answers would let someone into the app as a
 * nameless profile with no way back to the form that fills it in. Every field is validated
 * before anything is written, for the same reason.
 *
 * This is also where the handle stops being the provisional one derived from an email
 * address at admission and becomes one the person actually chose.
 *
 * **The four required fields are required; the last three are not, and that asymmetry is the
 * point.** Which of them the form even asks depends on a vocation the admin set — a catechumen
 * has no Christian name yet, and a layman has no ordination — so the server cannot demand what
 * it cannot know was offered. Anything omitted stays null and is answerable later from
 * Settings → General, which is the same write with `updateProfile` behind it. */
export const completeOnboarding = async (
    viewer,
    { firstName, lastName, handle, birthday, christianName, nameDay, ordinationDate },
) => {
    const first = readName(firstName, "firstName", "first name")
    const last = readName(lastName, "lastName", "last name")
    const chosen = readHandle(handle)
    const date = readBirthday(birthday)
    const christian = readOptionalText(christianName, "christianName", "Christian name")
    const feast = readNameDay(nameDay)
    const ordained = readOrdinationDate(ordinationDate)

    try {
        const profile = await prisma.profile.update({
            where: { id: viewer.id },
            /* The tallies come back with the row so the response is the same shape `/api/me`
             * ships — an updated viewer the client can swap in whole. Free: same statement. */
            include: followCounts.select,
            data: {
                firstName: first,
                lastName: last,
                handle: chosen,
                birthday: date,
                ...(christian !== undefined ? { christianName: christian } : {}),
                ...(feast ?? {}),
                ...(ordained !== undefined ? { ordinationDate: ordained } : {}),
                onboardedAt: new Date(),
            },
        })

        /* Naming yourself does not change which groups you are in, so the snapshot
         * `requireViewer` loaded is still accurate — and re-reading it would be a round
         * trip to learn nothing. */
        return projectViewer(profile, viewer.memberships)
    } catch (error) {
        /* The unique constraint is the real arbiter of a handle, not the availability check
         * that ran while they typed — two people can pick the same name in the seconds
         * between. Reported as a field error so the form can send them back to that step
         * rather than failing the whole submission as something unexplained. */
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            throw invalid("That handle was just taken. Please choose another.", {
                handle: "Taken",
            })
        }
        throw error
    }
}

/* Edits the viewer's own profile — everything on it that is theirs to change: their picture,
 * their name, their @handle, their birthday, and the three parish facts orientation may not
 * have asked them for.
 *
 * **Everything except `vocation`, and that exception is the whole shape of the rule.** A
 * vocation is what the admin check and the roster's sort order are derived from, so it is the
 * admin's to set and nobody may promote themselves to Priest. Everything else here is a fact
 * about the person that only the person can supply, so it belongs to them — including the
 * handle, which people do outgrow, and which the unique constraint below still arbitrates.
 *
 * `email` is not here either: it is the credential Supabase owns, and changing it is an
 * account operation with a verification step rather than a profile edit.
 *
 * **A partial update, keyed on `undefined` versus `null`.** A field the caller did not mention
 * is left alone; one sent empty is cleared. That distinction is what lets a clergy form that
 * never renders a Christian-name box coexist with a layman's that never renders an ordination
 * date, and it is what lets the avatar picker send one field without touching the rest.
 *
 * Answers the whole viewer, so the auth store swaps in one object and the nav's avatar, the
 * settings form, and the face on every one of the viewer's own comments move together. Editing
 * your own details cannot change which groups you are in, so `requireViewer`'s membership
 * snapshot is still accurate and re-reading it would be a round trip to learn nothing — the
 * same reasoning as `completeOnboarding`. */
export const updateProfile = async (viewer, input) => {
    const first = readNameIfGiven(input.firstName, "firstName", "first name")
    const last = readNameIfGiven(input.lastName, "lastName", "last name")
    const chosen = input.handle === undefined ? undefined : readHandle(input.handle)
    const born = input.birthday === undefined ? undefined : readBirthday(input.birthday)
    const christian = readOptionalText(input.christianName, "christianName", "Christian name")
    const feast = readNameDay(input.nameDay)
    const ordained = readOrdinationDate(input.ordinationDate)
    const picture = readAvatarUrl(viewer, input.avatar)

    const data = {
        ...(first !== undefined ? { firstName: first } : {}),
        ...(last !== undefined ? { lastName: last } : {}),
        ...(chosen !== undefined ? { handle: chosen } : {}),
        ...(born !== undefined ? { birthday: born } : {}),
        ...(picture !== undefined ? { avatarUrl: picture } : {}),
        ...(christian !== undefined ? { christianName: christian } : {}),
        ...(feast ?? {}),
        ...(ordained !== undefined ? { ordinationDate: ordained } : {}),
    }

    /* Nothing to write is not an error — a form submitted unchanged should answer the viewer
     * it already had. It still costs the tallies, because the answer has to be a *whole*
     * viewer: the client swaps this in wholesale, and one without them would blank the counts
     * on the profile they were just looking at. */
    if (Object.keys(data).length === 0) {
        const counts = await prisma.profile.findUnique({
            where: { id: viewer.id },
            ...followCounts,
        })
        return projectViewer({ ...viewer, _count: counts?._count }, viewer.memberships)
    }

    try {
        const profile = await prisma.profile.update({
            where: { id: viewer.id },
            data,
            include: followCounts.select,
        })
        return projectViewer(profile, viewer.memberships)
    } catch (error) {
        /* The unique constraint is the real arbiter of a handle, exactly as it is during
         * orientation — two people can pick the same one in the seconds between a form loading
         * and being saved. Reported as a field error so the form can mark the input rather
         * than failing the whole submission as something unexplained. */
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw invalid("That handle is already taken. Please choose another.", {
                handle: "Taken",
            })
        }
        throw error
    }
}

/* ---------------------------------------------------------------------------
 * The roster
 * ------------------------------------------------------------------------- */

/* One row of the roster.
 *
 * The name goes over as parts, like everywhere else — the roster is in fact the surface
 * that most needs them, because it sorts and searches on the surname that a composed
 * "Dn. Paul" would have thrown away.
 *
 * There is no `verified` here: the check means "administers this group", and this row
 * already carries `role`. Sending both would be the same fact twice, with the ever-present
 * risk of them disagreeing. */
const projectMember = (membership) => ({
    id: membership.profile.id,
    membershipId: membership.id,
    email: membership.profile.email,
    handle: membership.profile.handle,
    firstName: membership.profile.firstName,
    lastName: membership.profile.lastName,
    christianName: membership.profile.christianName,
    avatar: membership.profile.avatarUrl,
    vocation: membership.profile.vocation,
    role: membership.role,
    status: membership.status,
    admittedAt: membership.admittedAt.toISOString(),
    decidedAt: membership.decidedAt?.toISOString() ?? null,
    /* The two facts an admin needs to tell an invitation that was taken up from one that
     * was not, and a member who arrived from one still mid-orientation. */
    lastSeenAt: membership.profile.lastSeenAt?.toISOString() ?? null,
    onboardedAt: membership.profile.onboardedAt?.toISOString() ?? null,
})

/* Everyone in a group, for its admins.
 *
 * Admin-only, and the check is `requireMembership(..., { role: "ADMIN" })`: a member list
 * is a roster of a parish's congregation, which is exactly the kind of thing that should
 * not be readable by anyone who merely belongs to it.
 *
 * `status: "asc"` puts APPROVED first, and that is not alphabetical — Postgres sorts an
 * enum by its *declaration* order, which in schema.prisma is APPROVED, REVOKED. The people
 * actually in the parish lead, and removed members settle at the bottom. Reordering those
 * values in the schema silently reorders this. */
export const listMembers = async (viewer, orgId) => {
    requireMembership(viewer, orgId, { role: "ADMIN" })

    const memberships = await prisma.membership.findMany({
        where: { orgId },
        include: { profile: true },
        orderBy: [{ status: "asc" }, { admittedAt: "asc" }],
    })

    return { items: memberships.map(projectMember), nextCursor: null }
}

/* ---------------------------------------------------------------------------
 * Admission
 * ------------------------------------------------------------------------- */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* A provisional handle from an email local part, made unique against what already exists.
 *
 * Handles are public @mentions and unique, but an admin inviting someone knows only their
 * address — so one is derived and de-duplicated rather than demanded up front. **This is a
 * placeholder, not the person's handle**: first-run orientation asks them to choose one and
 * overwrites this. What matters here is only that inviting two people at `j.smith@`
 * different domains cannot collide and fail the whole batch.
 *
 * Note it can produce something `readHandle` would reject — a two-letter local part is
 * under the minimum. That is fine and intentional: nothing validates a placeholder, and the
 * person replaces it before they ever reach the app. */
const deriveHandle = async (email) => {
    const base =
        email
            .split("@")[0]
            .toLowerCase()
            .replace(/[^a-z0-9._-]/g, "")
            .slice(0, 24) || "member"

    for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = attempt === 0 ? base : `${base}${attempt + 1}`
        const taken = await prisma.profile.findUnique({ where: { handle: candidate } })
        if (!taken) return candidate
    }
    return `${base}-${Math.random().toString(36).slice(2, 7)}`
}

/* Admits one person to a group.
 *
 * **Provisioned immediately, not on acceptance.** The Supabase auth user, the Profile, and
 * an APPROVED Membership are all created now, and the person simply signs in. There is no
 * token to redeem and no public accept route — which matters because a public route would
 * fight both the invite-only gate and the static export, and because a redemption link is
 * exactly the thing that cannot work inside the native WebView.
 *
 * The `Invite` row is kept purely as the audit trail: who admitted whom, to what role and
 * vocation, and when. It carries no token and no expiry, because there is nothing to
 * redeem — and nobody can ask to join in the first place, so it is never a request either.
 *
 * No email is sent. That is deliberate rather than a shortcut — it means a priest can add
 * forty people without touching a rate limit, and each of them signs in whenever they
 * choose. Telling them is out of band, which for a parish is how it actually happens. */
const admitOne = async (viewer, orgId, { email, role, vocation }) => {
    const address = String(email ?? "").trim().toLowerCase()
    if (!EMAIL_PATTERN.test(address)) {
        throw invalid(`"${email}" is not a valid email address.`, { email: "Invalid" })
    }

    /* Already known to this parish? Re-admitting is an update, not a duplicate — this is
     * the path back for someone previously revoked. */
    const existingProfile = await prisma.profile.findUnique({ where: { email: address } })

    if (existingProfile) {
        const membership = await prisma.membership.upsert({
            where: { profileId_orgId: { profileId: existingProfile.id, orgId } },
            update: { role, status: "APPROVED", decidedAt: new Date(), decidedById: viewer.id },
            create: {
                profileId: existingProfile.id,
                orgId,
                role,
                status: "APPROVED",
                decidedAt: new Date(),
                decidedById: viewer.id,
            },
            include: { profile: true },
        })
        /* Vocation is the admin's to set, here and later. */
        if (vocation && vocation !== existingProfile.vocation) {
            await prisma.profile.update({
                where: { id: existingProfile.id },
                data: { vocation },
            })
            membership.profile.vocation = vocation
        }
        return projectMember(membership)
    }

    /* New person: create the credential first. If this fails there is no orphaned Profile
     * to clean up, whereas the reverse order would leave one behind. */
    const supabase = supabaseAdmin()
    const { data, error } = await supabase.auth.admin.createUser({
        email: address,
        email_confirm: true,
    })

    /* "Already registered" is not a failure — it is an auth user with no Profile, and the
     * fix is to adopt its id rather than to refuse the address.
     *
     * No Profile carries this address (the lookup above just said so), so the two stores have
     * drifted: `db:reset` drops the Profile while the hosted `auth.users` row survives, and
     * every address ever admitted through the app lands here on the next attempt. Refusing
     * left it unaddable in both directions and the admin with a roster that does not contain
     * the person the error says already exists.
     *
     * Adopting is also the only *correct* answer. `Profile.id` must mirror `auth.users.id` —
     * a fresh uuid would key the Profile to an id the person's real token never carries, and
     * every request would 401 with a valid session. Same reasoning as `provisionAuthUser`. */
    const authUserId = data?.user?.id ?? (await findAuthUserByEmail(supabase, address))?.id

    if (!authUserId) {
        throw invalid(
            `Could not create an account for ${address}: ${error?.message ?? "unknown error"}`,
            { email: "Failed" },
        )
    }

    const handle = await deriveHandle(address)

    const membership = await prisma.$transaction(async (tx) => {
        /* No name. An admin admits an address, not a person's given and family name, and
         * inventing one from the email local part is worse than leaving it empty: it
         * produces a plausible-looking "j.smith" in every byline that nobody ever corrects,
         * because it does not look like a placeholder. Null renders as the handle until
         * they complete orientation, and the roster can tell the two states apart. */
        await tx.profile.create({
            data: {
                id: authUserId,
                email: address,
                handle,
                vocation,
            },
        })
        return tx.membership.create({
            data: {
                profileId: authUserId,
                orgId,
                role,
                status: "APPROVED",
                decidedAt: new Date(),
                decidedById: viewer.id,
            },
            include: { profile: true },
        })
    })

    await prisma.invite
        .upsert({
            where: { email_orgId: { email: address, orgId } },
            update: { role, vocation, invitedById: viewer.id },
            create: { email: address, orgId, role, vocation, invitedById: viewer.id },
        })
        /* The audit row is not worth failing an admission over. */
        .catch(() => {})

    return projectMember(membership)
}

/* Admits a batch. Every address is attempted, and failures are reported per address
 * rather than aborting the rest — a priest pasting in thirty emails should not lose
 * twenty-nine of them to one typo. */
export const inviteMembers = async (viewer, orgId, { emails, ...input }) => {
    requireMembership(viewer, orgId, { role: "ADMIN" })

    const role = readEnum(OrgRole, input.role, "role") ?? "MEMBER"
    const vocation = readEnum(Vocation, input.vocation, "vocation") ?? "FAITHFUL"

    const list = (Array.isArray(emails) ? emails : [emails])
        .flatMap((entry) => String(entry ?? "").split(/[\s,;]+/))
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)

    const unique = [...new Set(list)]
    if (unique.length === 0) {
        throw invalid("Enter at least one email address.", { emails: "Required" })
    }
    if (unique.length > 100) {
        throw invalid("Add at most 100 people at a time.", { emails: "Too many" })
    }

    const admitted = []
    const failed = []

    for (const email of unique) {
        try {
            admitted.push(await admitOne(viewer, orgId, { email, role, vocation }))
        } catch (error) {
            /* This is reported in a 200 body, so it never passes through the handler's
             * reduction to INTERNAL — only an AppError's message is safe to repeat. */
            failed.push({
                email,
                reason:
                    error instanceof AppError
                        ? error.message
                        : "Could not add this address.",
            })
        }
    }

    return { admitted, failed }
}

/* Changes a membership: approve a request, revoke access, or adjust role/vocation.
 *
 * One endpoint rather than four, because they are the same authorization question asked
 * about the same row, and splitting them would mean four places to keep that check right.
 *
 * Revoking is a status change, never a delete — the person's posts and comments stay
 * attributed to a real profile, the history survives, and re-admitting them later is one
 * field. It also does **not** remove their Supabase account: they can still authenticate,
 * they simply have no group to read. The app shows them the access-removed screen. */
export const updateMembership = async (viewer, membershipId, input) => {
    const status = readEnum(MembershipStatus, input.status, "status")
    const role = readEnum(OrgRole, input.role, "role")
    const vocation = readEnum(Vocation, input.vocation, "vocation")

    const membership = await prisma.membership.findUnique({
        where: { id: membershipId },
        /* The group comes along for the owner check below. One `include` on a single row, so
         * it is the same statement rather than a second round trip. */
        include: { profile: true, org: { select: { createdById: true } } },
    })
    if (!membership) throw notFound("Member not found.")

    requireMembership(viewer, membership.orgId, { role: "ADMIN" })

    /* The group's owner cannot be revoked or demoted, by anybody.
     *
     * This is what makes `Organization.createdById` a subscription boundary rather than a
     * label. An owner creates a group and admits its priest as a second admin; without this,
     * that priest could revoke the owner's membership and take the group — and there would
     * be no way back, because every route into a group goes through a membership row and the
     * owner would no longer have one.
     *
     * It is also why an owner's authority inside their own group can be an ordinary
     * membership instead of a special case checked on every read: the row is guaranteed to
     * stay there. See the header of `orgs.service.js`.
     *
     * Note this is not the same guard as the self-protection below, and neither subsumes the
     * other: that one stops an admin locking *themselves* out, this one stops an admin
     * locking out somebody else who cannot be replaced. */
    if (membership.org.createdById && membership.profileId === membership.org.createdById) {
        if (status && status !== "APPROVED") {
            throw invalid("The owner of a group cannot be removed from it.", {
                status: "Not allowed",
            })
        }
        if (role && role !== "ADMIN") {
            throw invalid("The owner of a group is always an admin of it.", {
                role: "Not allowed",
            })
        }
    }

    /* An admin cannot demote or remove themselves.
     *
     * Both halves matter, and for the same reason: this endpoint is the only way back in.
     * Revoking your own membership locks you out of the parish, and dropping your own role
     * to MEMBER locks you out of the roster that could restore it — in a single-admin
     * parish, either one leaves nobody who can undo it. The UI hides both controls on the
     * viewer's own row, but that is presentation; this is the check that holds. */
    if (membership.profileId === viewer.id) {
        if (status && status !== "APPROVED") {
            throw invalid("You cannot remove your own access.", { status: "Not allowed" })
        }
        if (role && role !== membership.role) {
            throw invalid("You cannot change your own role.", { role: "Not allowed" })
        }
    }

    const updated = await prisma.membership.update({
        where: { id: membershipId },
        data: {
            ...(status ? { status, decidedAt: new Date(), decidedById: viewer.id } : {}),
            ...(role ? { role } : {}),
        },
        include: { profile: true },
    })

    if (vocation && vocation !== updated.profile.vocation) {
        const profile = await prisma.profile.update({
            where: { id: updated.profileId },
            data: { vocation },
        })
        updated.profile = profile
    }

    return projectMember(updated)
}
