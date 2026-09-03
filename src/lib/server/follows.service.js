import "server-only"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { readableOrgIds } from "@/lib/server/auth"
import { invalid, notFound } from "@/lib/server/errors"
import { keysetOrder, keysetPage, keysetWhere } from "@/lib/server/cursor"
import { notifyFollow, pushFollow, unnotifyFollow } from "@/lib/server/notifications.service"
import { projectPerson, projectProfile } from "@/lib/server/projections"

/* Somebody else's profile, and the follow graph hanging off it.
 *
 * ── Who you may look at ─────────────────────────────────────────────────────
 *
 * **A shared APPROVED membership, and nothing else.** Every other read in this app narrows to
 * the viewer's groups; a person is not content and has no group of their own, so the rule has
 * to be stated rather than inherited — and the honest statement of it is the same boundary:
 * you may read the people you are in a parish with. That keeps `/api/profiles/:handle` from
 * being a directory of every account in the system, which is what it would be if a handle
 * alone were enough.
 *
 * `notFound` rather than `forbidden` for a person outside that boundary, for the reason
 * `requireMembership` answers 404 for a group the viewer was never in: otherwise the endpoint
 * confirms whether a handle exists, and handle enumeration across a whole diocese is real
 * information about real people.
 *
 * ── What following does, and what it does not ───────────────────────────────
 *
 * It tells the person they were followed, and that is the whole of it. It grants no read —
 * `readableOrgIds` does not consult this table and must not start, or one parish's posts would
 * reach somebody with no membership in it. It is a list, kept for direct messaging, where "who
 * can I start a conversation with" needs a better answer than everyone in the diocese. See the
 * `Follow` model.
 *
 * ── The lists are not re-scoped ─────────────────────────────────────────────
 *
 * A profile's followers are shown whole, not filtered to the people the *reader* also shares a
 * group with. Filtering them would make the list disagree with the count above it, and the
 * count is a `_count` over the same rows — so the choice is one consistent answer or two
 * inconsistent ones. Everyone here is inside the same invite-only app, admitted by an admin,
 * so what is exposed is that a person somebody can already see is followed by another person;
 * the group that connects them is never named, which is the fact worth protecting. */

/* Everything the profile surface and the follow toggle read off a person, in one query.
 *
 * The memberships are the *authorization* input, not content — `visibleProfile` intersects
 * them with the viewer's and then discards them, and `projectProfile` never sees them. They ride
 * along with the profile rather than being asked for separately, so the check that the viewer may
 * read this person at all costs no round trip of its own.
 *
 * `_count` is why there are no follower-count columns on `Profile`; see the `Follow` model. It is
 * deliberately *not* under `relationLoadStrategy: "join"` — the join strategy does not compile an
 * aggregate, so asking for one here would be a claim the query planner cannot honour. */
const profileRead = {
    include: {
        memberships: {
            where: { status: "APPROVED" },
            select: { orgId: true },
        },
        _count: { select: { followers: true, following: true } },
    },
}

/* A handle as it would be stored. Lowercased and stripped of a leading `@`, matching
 * `readHandle` — a URL is typed and pasted by people, and `/u/@Fr.Alexander` should resolve
 * to the same person as `/u/fr.alexander` rather than 404. Not validated beyond that: an
 * unknown handle is a 404 whether it was well-formed or not, and running the format rules here
 * would only change which of two identical answers is given. */
const normalizeHandle = (value) =>
    String(value ?? "")
        .trim()
        .replace(/^@+/, "")
        .toLowerCase()

/* The profile behind a handle, if this viewer is allowed to see it at all.
 *
 * Returns the row with its memberships still attached, because `toggleFollow` needs the same
 * check and the same row and should not pay for it twice. */
const visibleProfile = async (viewer, handle) => {
    const wanted = normalizeHandle(handle)
    if (!wanted) throw notFound("Person not found.")

    const profile = await prisma.profile.findUnique({
        where: { handle: wanted },
        ...profileRead,
    })
    if (!profile) throw notFound("Person not found.")

    /* Your own profile is always visible, which matters for a viewer who belongs to nothing —
     * a freshly provisioned platform owner has no memberships to share with themselves. */
    if (profile.id === viewer.id) return profile

    const mine = new Set(readableOrgIds(viewer))
    const shared = profile.memberships.some((membership) => mine.has(membership.orgId))
    if (!shared) throw notFound("Person not found.")

    return profile
}

/* Does the viewer follow this person? One indexed primary-key lookup. */
const followsThem = async (viewerId, profileId) => {
    if (viewerId === profileId) return false
    const row = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: profileId } },
        select: { createdAt: true },
    })
    return row !== null
}

/* GET /api/profiles/:handle */
export const getProfile = async (viewer, handle) => {
    const profile = await visibleProfile(viewer, handle)
    const isSelf = profile.id === viewer.id

    return projectProfile(profile, {
        following: await followsThem(viewer.id, profile.id),
        isSelf,
    })
}

/* POST /api/profiles/:handle/follow — toggles, and answers the resulting state.
 *
 * `{ following, followers }` rather than 204, mirroring the like toggles: an optimistic client
 * needs the authoritative result to reconcile against, and returning nothing would force it to
 * re-fetch the profile to find out what happened.
 *
 * The count is read back rather than derived from the one already in hand, because the write
 * that just landed is not the only one that may have: two people can follow the same person in
 * the same second, and a client-side increment on a stale read shows a number that is quietly
 * one short until the next open.
 *
 * A racing duplicate surfaces as Prisma `P2002` and is treated as "already following" rather
 * than as an error — the composite primary key is what makes a double-tap idempotent at the
 * database level, exactly as it is for a like. The delete needs no such guard: `deleteMany`
 * removes zero rows without complaint. */
export const toggleFollow = async (viewer, handle) => {
    const profile = await visibleProfile(viewer, handle)

    if (profile.id === viewer.id) {
        throw invalid("You cannot follow yourself.", { handle: "Not allowed" })
    }

    const key = { followerId: viewer.id, followingId: profile.id }
    const already = await followsThem(viewer.id, profile.id)

    /* Their notification rides in the same transaction as the follow, so the two cannot
     * disagree, and in the same dispatch, so it costs no round trip. Exactly the shape a like
     * uses; see notifications.service.js. */
    const notification = { recipientId: profile.id, actorId: viewer.id }

    if (already) {
        await prisma.$transaction([
            prisma.follow.deleteMany({ where: key }),
            unnotifyFollow(notification),
        ])
    } else {
        try {
            await prisma.$transaction([
                prisma.follow.create({ data: key }),
                notifyFollow(notification),
            ])
        } catch (error) {
            const duplicate =
                error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
            if (!duplicate) throw error
        }

        /* Only a new follow buzzes. An unfollow has a row to retract but nothing to announce,
         * and the retraction cannot reach a banner already on a lock screen anyway. */
        pushFollow({ recipientId: profile.id, actor: viewer })
    }

    const followers = await prisma.follow.count({ where: { followingId: profile.id } })

    return { following: !already, followers }
}

/* Which of these people does the viewer already follow?
 *
 * One statement for the whole page rather than a lookup per row — the alternative is twenty
 * round trips to draw twenty buttons, which against a pooler in another region is the entire
 * cost of the request. The `IN` is over the page's ids, so it is an index scan of at most
 * `PAGE_SIZE.FOLLOWS` rows. */
const followedAmong = async (viewerId, profileIds) => {
    if (profileIds.length === 0) return new Set()

    const rows = await prisma.follow.findMany({
        where: { followerId: viewerId, followingId: { in: profileIds } },
        select: { followingId: true },
    })
    return new Set(rows.map((row) => row.followingId))
}

/* The two list reads, which differ only in which end of the join they page over.
 *
 * `direction` is "desc" — newest follow first, so somebody who has just followed you is at the
 * top of your followers, which is the only ordering anyone looks for in this list.
 *
 * The keyset's tiebreaker is the *other* person's id rather than an `id` column, because
 * `Follow` is keyed by the pair and has none. `keysetWhere` / `keysetOrder` / `keysetPage` all
 * take the same one, and `Follow`'s two indexes are exactly these two orderings. */
const listFollows = async (viewer, handle, { limit, cursor }, side) => {
    const profile = await visibleProfile(viewer, handle)

    /* Followers of P are rows whose `followingId` is P, tie-broken on the follower; the
     * following of P is the mirror. Naming both halves keeps the two calls below from being
     * four near-identical ones. */
    const [anchor, tiebreaker, personKey] =
        side === "followers"
            ? ["followingId", "followerId", "follower"]
            : ["followerId", "followingId", "following"]

    const rows = await prisma.follow.findMany({
        where: { [anchor]: profile.id, ...keysetWhere(cursor, "desc", tiebreaker) },
        orderBy: keysetOrder("desc", tiebreaker),
        take: limit + 1,
        include: { [personKey]: true },
        /* One statement with a lateral join rather than a second SELECT for the profiles. */
        relationLoadStrategy: "join",
    })

    const page = keysetPage(rows, limit, (row) => row, tiebreaker)
    const followed = await followedAmong(
        viewer.id,
        page.items.map((row) => row[personKey].id),
    )

    return {
        items: page.items.map((row) =>
            projectPerson(row[personKey], {
                following: followed.has(row[personKey].id),
                isSelf: row[personKey].id === viewer.id,
            }),
        ),
        nextCursor: page.nextCursor,
    }
}

/* GET /api/profiles/:handle/followers */
export const listFollowers = (viewer, handle, page) =>
    listFollows(viewer, handle, page, "followers")

/* GET /api/profiles/:handle/following */
export const listFollowing = (viewer, handle, page) =>
    listFollows(viewer, handle, page, "following")
