import "server-only"

import { canDeleteOrg } from "@/lib/server/auth"
import { SIGNUP_STATUS } from "@/lib/constants"
import { documentType, formatBytes } from "@/lib/utils"

/* Database rows → wire shapes.
 *
 * This file is the boundary between the schema and the API contract, and keeping it
 * explicit is deliberate: a Prisma model handed straight to `Response.json` would publish
 * every column ever added to it, including the ones added later by someone who never
 * looked at this file. Everything the client receives is listed here, by hand.
 *
 * It also absorbs the differences between the two, so neither has to bend to the other:
 * `likeCount`/`commentCount` are storage names but the client has always read
 * `likes`/`comments`; media is normalized rows in the database but the feed card wants
 * `image` + `width`/`height`, or `images`, or `document`. Renaming a column is a change
 * here and nowhere else. */

/* The author block every post and comment carries.
 *
 * **Both names go over: the one they are addressed by and the one they are filed under.**
 * `displayName` is what a byline prints; `firstName`/`lastName` is what a roster sorts on.
 * A server that shipped one composed string would make the other surface impossible without
 * a second endpoint, which is why `displayName()` and `fullName()` in `lib/name.js` both
 * take this block whole and each picks what it needs.
 *
 * `patronSaint` is **not** here. It is the saint written in full, it composes nothing, and
 * the surface that shows it is `<ProfileCard/>` — so it belongs to a profile rather than to a
 * byline. See the column in `prisma/schema.prisma`.
 *
 * `verified` is the blue check, and it is **computed, not stored**: it means "this person
 * administers the organization this post belongs to". `orgId` is therefore required to
 * answer it, and the caller must pass the org the content lives in — which is why this
 * takes it explicitly rather than reading it off the profile. Omitting it yields `false`,
 * the safe answer: a missing org can never manufacture a check.
 *
 * The membership rows come from `postInclude`/`commentInclude`, already filtered to the
 * author's APPROVED ADMIN memberships, so this is a scan of a handful of ids rather than a
 * query per card. */
export const projectAuthor = (profile, orgId = null) => ({
    handle: profile.handle,
    displayName: profile.displayName,
    firstName: profile.firstName,
    lastName: profile.lastName,
    vocation: profile.vocation,
    avatar: profile.avatarUrl,
    verified: Boolean(
        orgId && profile.memberships?.some((membership) => membership.orgId === orgId),
    ),
})

/* Media rows → the three shapes the feed card understands. A post has exactly one of
 * these, or none at all (a text-only announcement):
 *
 *   image + width + height   one photo; the dimensions let the card reserve the correct
 *                            aspect-ratio box before the image decodes, without which it
 *                            collapses to zero height on a cold cache and shifts the
 *                            layout as it loads
 *   images                   several photos, as the swipeable carousel
 *   document                 a file attachment
 */
const projectMedia = (media = []) => {
    const images = media.filter((item) => item.kind === "IMAGE")
    const document = media.find((item) => item.kind === "DOCUMENT")

    return {
        ...(images.length === 1
            ? {
                  image: images[0].url,
                  width: images[0].width,
                  height: images[0].height,
              }
            : {}),
        ...(images.length > 1 ? { images: images.map((item) => item.url) } : {}),
        ...(document
            ? {
                  document: {
                      name: document.fileName ?? "Attachment",
                      size: formatBytes(document.sizeBytes) ?? "",
                      type: documentType(document),
                      url: document.url,
                  },
              }
            : {}),
    }
}

/* A post, as the feed card and the detail surface read it.
 *
 * `liked` is per-viewer, so it cannot come off the row — the caller resolves it and passes
 * it in. `likedBy` is the social-proof person ("Mat. Carly and 17 others"), likewise
 * resolved by the caller because it is a different person for every viewer. Both default
 * to the unauthenticated-ish answer if omitted, which keeps a partial projection safe
 * rather than accidentally claiming the viewer liked something.
 *
 * `likedBy` is the name *parts*, not a rendered string, for the same reason the author
 * block is — the card writes it with `displayName()` so the person who liked a post is
 * addressed exactly as they are in their own byline.
 *
 * `canDelete` is whether this viewer may remove the post — ADMIN of the group it belongs
 * to, and only that (see `canDeletePost`). Composed here for the same reason a comment's is:
 * a rule the client re-derives can disagree with the one the server enforces, and the answer
 * is per-group, so a page of posts can carry both answers at once. Defaults false, the safe
 * answer. It is also what decides whether the options menu appears at all — a menu with
 * nothing in it must not be offered.
 *
 * The owning organization goes over as both `orgId` and `orgName` because the two answer
 * different questions and only one of them is a label. `orgName` is what the card prints;
 * `orgId` is what a surface resolves the viewer's role against, which matters because a
 * post can belong to a group other than the one currently selected — a shared link opens
 * by id, so the detail surface has to ask "am I an admin *here*" rather than assume the
 * switcher's answer. */
export const projectPost = (
    post,
    { liked = false, likedBy = null, canDelete = false } = {},
) => ({
    id: post.id,
    author: projectAuthor(post.author, post.orgId),
    orgId: post.orgId,
    orgName: post.org?.name ?? null,
    createdAt: post.createdAt.toISOString(),
    title: post.title,
    body: post.body,
    ...projectMedia(post.media),
    likes: post.likeCount,
    comments: post.commentCount,
    liked,
    likedBy,
    canDelete,
})

/* A comment in an open thread. `text`, not `body` — the client has always called it that,
 * and the rename belongs here rather than in every component that renders one.
 *
 * `orgId` is the organization of the *post* the comment hangs under, which is what decides
 * whether its author wears the admin check. A comment has no organization of its own, so
 * the caller — which had to load the post to authorize the read anyway — passes it down.
 *
 * `canDelete` composes two separate rules — anyone may remove their own comment, and an
 * admin may remove anyone's in the group they administer — into the one boolean the row
 * needs to decide whether to offer the affordance. Derived here rather than left to the
 * client for the same reason `access` is: a rule the UI works out for itself can disagree
 * with what `deleteComment` would actually enforce. Defaults false, the safe answer. */
export const projectComment = (
    comment,
    { liked = false, orgId = null, canDelete = false } = {},
) => ({
    id: comment.id,
    author: projectAuthor(comment.author, orgId),
    text: comment.body,
    createdAt: comment.createdAt.toISOString(),
    likes: comment.likeCount,
    liked,
    canDelete,
})

/* One line in the notifications panel.
 *
 * `actor` is the same author block a post byline carries, resolved against the *post's*
 * group — so the person who liked your announcement wears the check in the parish it was
 * published into, exactly as they would above a post of their own. The panel is not scoped
 * to the selected group, so this is the only thing that could answer it correctly.
 *
 * It carries two fields a byline has no use for, both for the follow-back button on a FOLLOW
 * row: `id`, because the follow write patches rows by id wherever the same person appears, and
 * `following`, the viewer's own answer to "do you follow them back". They go on every row
 * rather than on the FOLLOW ones alone — the actor block is one shape whatever the type, and
 * both come free from a statement that had already joined the person.
 *
 * `type` goes over raw rather than as a rendered sentence. "liked your post" is copy, and
 * copy belongs on the client next to the layout that has to fit it — the same reason a name
 * ships as parts. It is also what lets a grouped line ("and 9 others") reuse this projection
 * unchanged when that lands; see the GROUPING note in `notifications.service.js`.
 *
 * `postId` is where this notification points, and it is null for a FOLLOW — the one event
 * that happens inside no post. A row without one opens the actor's card instead, which is the
 * only destination a follow has.
 *
 * `orgName` is what a NEW_POST line names — "posted in Holy Trinity Cathedral" — and it has
 * to come from the post rather than from the switcher, because this panel is not scoped to
 * the selected group and the post very often belongs to another one.
 *
 * `read` rather than `readAt`: the panel tints a row and the bell counts, and neither has
 * any use for the instant it happened to be marked. */
export const projectNotification = (notification) => ({
    id: notification.id,
    type: notification.type,
    actor: {
        ...projectAuthor(notification.actor, notification.post?.orgId ?? null),
        id: notification.actorId,
        following: notification.actor.followers.length > 0,
    },
    postId: notification.postId,
    orgName: notification.post?.org?.name ?? null,
    /* Where a SIGNUP_REMINDER or SIGNUP_CANCELED points, and absent on every other kind — the
     * "not applicable to this representation" rule rather than a null. It carries the sheet's
     * title and the slot's start because that is the whole of what the line says ("Coffee hour
     * is on Sunday at 11"), and joining it here is what keeps the panel from having to fetch a
     * sheet to render one row. */
    ...(notification.signupSlot
        ? {
              signup: {
                  slotId: notification.signupSlot.id,
                  sheetId: notification.signupSlot.sheetId,
                  title: notification.signupSlot.sheet.title,
                  startsAt: notification.signupSlot.startsAt.toISOString(),
                  canceled: notification.signupSlot.canceledAt !== null,
              },
          }
        : notification.signupSheet
            ? {
                  /* A publication names the rota and no date — there is no one date it is
                   * about. The row's copy branches on that rather than on the type, so a
                   * missing `startsAt` is the shape of the thing rather than a gap in it. */
                  signup: {
                      sheetId: notification.signupSheet.id,
                      title: notification.signupSheet.title,
                  },
              }
            : {}),
    createdAt: notification.createdAt.toISOString(),
    read: notification.readAt !== null,
})

/* An organization, as the Groups surface and the viewer's profile read it. `role` and
 * `status` come from the viewer's membership, so this is always a viewer-relative view of
 * a group rather than a public one.
 *
 * `canDelete` is composed here for the same reason a post's is: it is a rule the client would
 * otherwise re-derive, and a re-derived rule can disagree with the one `deleteOrg` enforces —
 * which shows up as a delete button that 403s. It is narrower than `role` and cannot be worked
 * out from anything else in this shape, since `createdById` is deliberately not shipped. See
 * `canDeleteOrg`. Defaults false, the safe answer, so a partial projection can never
 * manufacture the affordance.
 *
 * `slug` goes over because the delete confirmation is keyed on it — `deleteOrg` requires the
 * caller to echo it back. Nothing renders it. */
export const projectOrg = (org, membership, { canDelete = false } = {}) => ({
    id: org.id,
    slug: org.slug,
    name: org.name,
    kind: org.kind,
    avatar: org.avatarUrl,
    bio: org.bio,
    /* The parish's own calendar, exactly as an admin typed it. Shipped to every member rather
     * than to admins alone: it is the address of a calendar the parish publishes to the world,
     * so there is nothing in it to withhold, and the group settings form seeds from the same
     * `user.orgs` row every other field on it does. */
    calendarUrl: org.calendarUrl ?? null,
    role: membership?.role ?? null,
    status: membership?.status ?? null,
    canDelete,
})

/* One person, as a row in a follower or following list.
 *
 * The name in parts and nothing else — this is the smallest shape that can draw an avatar, a
 * line of text, and a follow button, and a list of two hundred people should carry nothing
 * more. There is no `verified` here and no vocation title: a row names somebody so the reader
 * can recognise them and tap through, and the profile it opens is where the detail lives.
 *
 * `following` is per-viewer, so it cannot come off the row; the caller resolves the whole
 * page's answer in one query and passes it in. `isSelf` is what tells a row to draw no button
 * at all, and it is composed here for the same reason `canDelete` is — a rule the client
 * re-derives is a rule that can disagree with the one the server enforces. */
export const projectPerson = (profile, { following = false, isSelf = false } = {}) => ({
    id: profile.id,
    handle: profile.handle,
    displayName: profile.displayName,
    firstName: profile.firstName,
    lastName: profile.lastName,
    vocation: profile.vocation,
    avatar: profile.avatarUrl,
    following,
    isSelf,
})

/* Somebody else's profile, as `/u/:handle` reads it.
 *
 * **It carries no groups, and that is the deliberate part.** Naming a parish to a reader who
 * has no membership in it is the leak that a join-request feature would have to be designed
 * around first — see the admission note in `prisma/schema.prisma`. The whole reason this
 * resource can be read at all is a shared membership, and saying which one would be saying
 * more than the read was granted for.
 *
 * **There is no `verified` either.** The check means "administers the group you are reading
 * this in", and a profile is not read *in* a group — so the honest answer here is the person's
 * vocation, which is global and is what the reader actually came to know. Inventing a
 * profile-wide check would recreate the flag the schema removed.
 *
 * The counts come from a `_count` on the read that was already being made rather than from two
 * columns kept in step by hand; see the `Follow` model. They are `followers` and
 * **`followingCount`** — the awkward second name is deliberate, because `following` is the
 * per-viewer boolean "do *you* follow them", and two fields one letter apart would be read
 * wrong exactly once and then trusted.
 *
 * `birthday` is **not** shipped: orientation promises it is never shown publicly, and the way
 * to keep that promise is for it not to leave the server. A name day is the opposite — a feast
 * the parish keeps together — so it does. */
export const projectProfile = (profile, { following = false, isSelf = false } = {}) => ({
    id: profile.id,
    handle: profile.handle,
    displayName: profile.displayName,
    firstName: profile.firstName,
    lastName: profile.lastName,
    patronSaint: profile.patronSaint,
    vocation: profile.vocation,
    avatar: profile.avatarUrl,
    /* One value or null, never half a date — the two columns are written together. Sent as
     * `MM-DD` because that is what a name day is: a month and a day with no year. */
    nameDay:
        profile.nameDayMonth && profile.nameDayDay
            ? `${String(profile.nameDayMonth).padStart(2, "0")}-${String(profile.nameDayDay).padStart(2, "0")}`
            : null,
    ordinationDate: profile.ordinationDate
        ? profile.ordinationDate.toISOString().slice(0, 10)
        : null,
    joinedAt: profile.createdAt.toISOString(),
    followers: profile._count?.followers ?? 0,
    followingCount: profile._count?.following ?? 0,
    following,
    isSelf,
})

/* ---------------------------------------------------------------------------
 * Events
 * ------------------------------------------------------------------------- */

/* One entry on the compiled calendar, from the group's own feed.
 *
 * **`id` is composed rather than stored**, because there is nothing to store: a parish event
 * is expanded out of an iCalendar feed on every request, so the only stable name an
 * occurrence has is its series plus the instant it falls on. That pair is exactly what a
 * moved occurrence changes, which is correct — a Vespers pushed to 5pm is a different entry
 * from the one it replaced, and React should treat it as one.
 *
 * `kind` is what the grid colours a ring by, and it is the one field both shapes share. */
export const projectCalendarEntry = (event) => ({
    kind: "PARISH",
    id: `parish:${event.uid ?? event.title}:${event.startsAt.toISOString()}`,
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    allDay: event.allDay,
})

/* A sign-up slot as the calendar reads it — the same window a parish event occupies, plus the
 * two numbers that make it a rota rather than an appointment.
 *
 * Thinner than `projectSignupSlot` — no list of who signed up, because a square on a month grid
 * and a block on a day's timeline have no room for one. It carries **`mine` as the viewer's own
 * claim id** rather than as a boolean, though, and that is what lets the day view act: tapping a
 * block opens the sign-up surface, and giving up a place needs the claim to delete. A boolean
 * would mean loading the whole sheet to find out which row it was. */
export const projectCalendarSlot = (slot, viewerId) => ({
    kind: "SIGNUP",
    id: `signup:${slot.id}`,
    slotId: slot.id,
    sheetId: slot.sheetId,
    title: slot.sheet.title,
    note: slot.note,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    allDay: false,
    capacity: slot.capacity,
    taken: slot.claims.length,
    spotsLeft: slot.canceledAt ? 0 : Math.max(0, slot.capacity - slot.claims.length),
    canceled: slot.canceledAt !== null,
    open: slot.sheet.status === SIGNUP_STATUS.OPEN,
    /* The viewer's own claim on this date, or null — solid ring on the grid, and the row the
     * Give up button deletes. Answered off the claims already joined, so it costs nothing. */
    mine: slot.claims.find((claim) => claim.profileId === viewerId)?.id ?? null,
    /* The bodies standing for this slot, so the calendar can read "OCF" where it would
     * otherwise read a person's name. Names only, deduped — the square has room for one line.
     * See `SignupClaim.onBehalfOf`. */
    onBehalfOf: [
        ...new Set(slot.claims.map((claim) => claim.onBehalfOf).filter(Boolean)),
    ],
})

/* One person in one slot.
 *
 * `person` is the name in parts, like every other byline in the app, so `displayName()`
 * addresses a volunteer exactly as it addresses an author. `onBehalfOf` sits *beside* it
 * rather than replacing it: the parish should be able to see both that the Fellowship has
 * coffee hour and who to ring about it.
 *
 * `canRemove` composes two rules the client would otherwise re-derive — your own spot is
 * yours to give up, and an admin may take somebody off a slot they can no longer make. Same
 * argument as a comment's `canDelete`: a re-derived rule can disagree with the one the server
 * enforces, and here it would show a button that 403s. */
export const projectClaim = (claim, { viewerId, canManage = false } = {}) => ({
    id: claim.id,
    person: claim.profile ? projectAuthor(claim.profile) : null,
    onBehalfOf: claim.onBehalfOf,
    note: claim.note,
    createdAt: claim.createdAt.toISOString(),
    isSelf: claim.profileId === viewerId,
    canRemove: canManage || claim.profileId === viewerId,
})

/* One dated opening on a sheet, as the sign-ups tab reads it.
 *
 * **`spotsLeft` is shipped rather than left as `capacity - taken`.** Not because the
 * subtraction is hard, but because a cancelled slot has no spots left and is not full either,
 * and every surface that did the arithmetic itself had to remember that. One number, one
 * meaning: how many people this slot can still take.
 *
 * `mine` is the viewer's own claim id, not a boolean, because the button that appears when it
 * is set is the one that deletes it. A boolean would mean finding the claim again in a list
 * the row already has in hand. */
export const projectSignupSlot = (slot, { viewerId, canManage = false } = {}) => {
    const claims = slot.claims ?? []
    const canceled = slot.canceledAt !== null
    const mine = claims.find((claim) => claim.profileId === viewerId) ?? null

    return {
        id: slot.id,
        sheetId: slot.sheetId,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        capacity: slot.capacity,
        note: slot.note,
        canceled,
        taken: claims.length,
        spotsLeft: canceled ? 0 : Math.max(0, slot.capacity - claims.length),
        mine: mine?.id ?? null,
        claims: claims.map((claim) => projectClaim(claim, { viewerId, canManage })),
    }
}

/* A sign-up sheet: the rota, and its dates.
 *
 * **The slots always ride along, and the tallies deliberately do not.** A collapsed row says
 * "4 dates need people", which is a count over slots — and the client has to be able to redo
 * that count the moment somebody signs up, without re-reading the list. Counting it here as
 * well would put the same arithmetic in two places, and the copy that drifts is the one nobody
 * is looking at. So the slots go over and the client counts them (`summarize` in
 * `lib/utils.js`), which is only affordable because the slots are shipped anyway — see
 * `listSheets` for why they are.
 *
 * It also puts "the next date" in the right hands: that is a question about *now*, and the
 * server's now is not the reader's. */
export const projectSignupSheet = (sheet, { viewerId, canManage = false } = {}) => ({
    id: sheet.id,
    orgId: sheet.orgId,
    title: sheet.title,
    description: sheet.description,
    status: sheet.status,
    timezone: sheet.timezone,
    /* Whether this rota keeps going. The form reads it back, and the row says "ongoing" rather
     * than counting down to a last date that does not exist. */
    repeats: sheet.repeats,
    /* The title this rota is matched to on the parish calendar, or null for "use the title
     * above". Shipped so the manage surface can edit it; see `mergeCalendar`. */
    calendarTitle: sheet.calendarTitle,
    createdAt: sheet.createdAt.toISOString(),
    /* Composed from the same `requireMembership` the writes run, so a member never sees an
     * Edit affordance and an admin demoted mid-session loses it on the next read. */
    canManage,
    slots: (sheet.slots ?? []).map((slot) => projectSignupSlot(slot, { viewerId, canManage })),
})

/* Whether this viewer may use the app, and if not, why.
 *
 * Derived here rather than left to the client, so the gate branches on one value that
 * cannot drift from what the API would actually enforce. The order of the checks is the
 * precedence: one approved membership is enough to be in, regardless of what else is
 * revoked.
 *
 * **A platform owner is always ACTIVE, and that is the one place ownership touches a read.**
 * Not a privilege — it opens no group and reveals nothing — but a newly provisioned owner has
 * no memberships yet, by definition: they are about to create their first group. Without this
 * they would sign in to the access-removed screen and have no way to reach the thing they
 * just paid for. See the `PlatformRole` note in `prisma/schema.prisma`.
 *
 * Three values, not four. There is no PENDING, because nobody can ask to join — an admin
 * admits people and the membership is APPROVED from the moment it exists. REVOKED and NONE
 * stay distinct because they need different wording: one person was removed, the other was
 * never attached to a parish at all. */
const accessFor = (memberships, platformRole) => {
    if (memberships.some((m) => m.status === "APPROVED")) return "ACTIVE"
    if (platformRole === "OWNER") return "ACTIVE"
    if (memberships.some((m) => m.status === "REVOKED")) return "REVOKED"
    return "NONE"
}

/* The signed-in viewer. `role` and `vocation` are the two axes the UI reads — see the
 * header of `prisma/schema.prisma` for why they are separate — and `orgs` carries every
 * group the viewer belongs to, with their role in each.
 *
 * `role` at the top level is the viewer's role in their *primary* group, which is what a
 * single-organization app renders in the profile menu. It is a convenience over `orgs`,
 * not a second source of truth.
 *
 * `access` and `onboardedAt` are what the gates act on: the first decides whether the app
 * opens at all, the second whether first-run orientation still has to happen. */
export const projectViewer = (profile, memberships = []) => {
    const primary = memberships.find((m) => m.status === "APPROVED") ?? memberships[0] ?? null

    return {
        id: profile.id,
        email: profile.email,
        handle: profile.handle,
        /* All three, because the viewer is both rendered and edited: `displayName()` writes
         * their byline from the first, and the settings form seeds every one of its boxes
         * from the row it is going to write back. */
        displayName: profile.displayName,
        firstName: profile.firstName,
        lastName: profile.lastName,
        avatar: profile.avatarUrl,
        vocation: profile.vocation,
        /* The third axis, shipped so a client can offer the create-a-group affordance to the
         * one person it applies to. Presentation only, exactly like `role` — the endpoints it
         * unlocks run `requirePlatformOwner` themselves, and a client that lied about this
         * would get a 403 for its trouble. */
        platformRole: profile.platformRole,
        /* Date only — `@db.Date`, so there is no time to strip and no timezone to shift it
         * across. Sent as YYYY-MM-DD, which is what a date input expects. */
        birthday: profile.birthday ? profile.birthday.toISOString().slice(0, 10) : null,
        /* The three facts orientation collects beyond a name, shipped back so Settings →
         * General can seed its form from the viewer rather than fetching a second copy of
         * them. `nameDay` takes the same `MM-DD` shape `projectProfile` sends, so one control
         * reads both. */
        patronSaint: profile.patronSaint,
        nameDay:
            profile.nameDayMonth && profile.nameDayDay
                ? `${String(profile.nameDayMonth).padStart(2, "0")}-${String(profile.nameDayDay).padStart(2, "0")}`
                : null,
        ordinationDate: profile.ordinationDate
            ? profile.ordinationDate.toISOString().slice(0, 10)
            : null,
        onboardedAt: profile.onboardedAt?.toISOString() ?? null,
        createdAt: profile.createdAt.toISOString(),
        access: accessFor(memberships, profile.platformRole),
        role: primary?.role ?? null,
        /* The viewer's own follow tallies, under the names `projectProfile` uses — see that
         * projection for why the second one is `followingCount` and not `following`.
         *
         * **They are here so the viewer's own profile page can paint without a fetch.** The
         * client seeds `/u/<own handle>` from this viewer (`viewerProfile` in the auth store)
         * exactly as an opened post is seeded from the feed's cached row, then refreshes in the
         * background — so the one profile a person opens most never shows a skeleton.
         *
         * Zero when the caller did not ask for the counts. Every caller that hands this a fresh
         * row does ask, because the `_count` rides along with a read it was already making;
         * only `getViewer` pays a statement for them, and that is a boot-time call. */
        followers: profile._count?.followers ?? 0,
        followingCount: profile._count?.following ?? 0,
        /* Only groups the viewer is actually in. A revoked membership informs `access`
         * above but must not appear as one of their groups. */
        orgs: memberships
            .filter((m) => m.status === "APPROVED")
            .map((membership) =>
                projectOrg(membership.org, membership, {
                    canDelete: canDeleteOrg(profile, membership.org),
                }),
            ),
    }
}
