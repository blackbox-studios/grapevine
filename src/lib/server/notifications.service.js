import "server-only"

import { prisma } from "@/lib/db"
import { displayName } from "@/lib/name"
import { keysetOrder, keysetPage, keysetWhere } from "@/lib/server/cursor"
import { prunePushTokens, pushTokensFor } from "@/lib/server/devices.service"
import { projectNotification } from "@/lib/server/projections"
import { pushConfigured, sendPush } from "@/lib/server/push"

/* Notifications: the panel behind the bell, and the writes that fill it.
 *
 * Two families of event. Something somebody did to something of yours — a like on a post or a
 * comment, a comment on your post, a follow — and something a group did that you should know
 * about: an admin published a post or a rota, a date you signed up for is coming up or has been
 * called off. The read side is a plain keyset page of the viewer's own rows, identical for all
 * of them; the write side is a builder per event, spliced into the transaction the write it
 * accompanies was already running.
 *
 * ── Why the writes are builders and not functions that write ─────────────────
 *
 * `notifyLike` and `unnotifyLike` return a Prisma operation rather than performing one, so
 * `togglePostLike` can put it *inside* its existing `prisma.$transaction([...])`. Two things
 * follow from that, and both are the reason for the shape:
 *
 *  - **The notification cannot drift from the like that justifies it.** They commit
 *    together or not at all, exactly as the denormalized tallies do.
 *  - **It costs no round trip.** The array form is dispatched as one exchange, so a like
 *    still pays for one transaction however many statements are in it. A `notify()` that
 *    awaited its own write would add a full round trip to the hottest write in the app —
 *    see the "Round trips are the cost" section of backend-architecture.md.
 *
 * Returning `null` is how "there is nothing to notify" is expressed (a self-like); callers
 * filter it out of the array.
 *
 * ── Push notifications (Firebase) ────────────────────────────────────────────
 *
 * FCM is wired up, and none of the above changed when it landed. **The row is the
 * notification; a push is one delivery of it.** A device that was asleep when the like
 * arrived still finds the row here, the panel never depends on a delivery having succeeded,
 * and a viewer who has never granted the OS permission loses nothing but the buzz.
 *
 * The senders are at the bottom of this file, and the rule that shapes them is that they run
 * **after the transaction commits, and are never awaited by it**:
 *
 *  - *After*, because a push for a transaction that then rolled back cannot be recalled.
 *    There is no unsend, so the row committing is the only event worth announcing.
 *  - *Not awaited*, because FCM is a third party on the far side of the internet and a like
 *    must not get slower — or fail — because Google is having a bad minute. Every entry
 *    point below swallows its own errors and returns nothing.
 *
 * They also cost exactly one query each (the recipients' device tokens). The actor's name
 * and the group's name are already in hand at every call site: `requireViewer` loads the
 * viewer's profile, and `requireMembership` reads the group off the memberships it came
 * with. Composing a title must not become the reason a like queries twice.
 *
 * ── GROUPING: "10 people liked your post" (a game plan, not built) ───────────
 *
 * Today ten likes on one post are ten rows and ten lines in the panel. The unique key on
 * `(recipient, actor, type, subject)` already does the *other* half of the job — it settles
 * like → unlike → like at one row rather than three — but it deliberately does not collapse
 * across actors, and it must not: "who liked it" needs one row per person, and an unlike
 * has to have a specific row to delete.
 *
 * So grouping is a **read-side** change, and the plan is:
 *
 *  1. Group on `(type, subjectId)` at read time and take the newest row per group, plus a
 *     count of the rest and the newest actor's name. That is the same `DISTINCT ON` shape
 *     `likedByNames` in posts.service.js already uses to name the social-proof liker on a
 *     feed card, against an index this table already carries the leading columns for.
 *  2. Project it as `{ actor, others: 9 }` and let the client render "Mat. Carly and 9
 *     others liked your post" — the row component takes a count either way, so the panel
 *     does not change shape.
 *  3. Page on the group's newest `createdAt`/`id`, which is what the existing keyset
 *     already compares; unread stays `count(*) where read_at is null`, which is a tally of
 *     events rather than of lines and is the honest number for a badge.
 *
 * The alternative — aggregating on write, one counter row per subject — is what to avoid.
 * It has to be decremented on every unlike, it cannot name the remaining likers once the
 * newest one takes their like back, and it makes the row's meaning depend on the order the
 * writes happened to arrive in. */

/* The relations a projected notification needs, in one statement.
 *
 * `actor` is the person to render, and `memberships` is filtered to their APPROVED admin
 * rows so `projectAuthor` can answer the check without a query per line — the same trick
 * `authorSelect` plays in posts.service.js. `post` supplies the group the check is resolved
 * against, and a FOLLOW has none, so a follower wears no check — which is the same answer
 * `<ProfileCard/>` gives, and for the same reason: the check means "administers the group you
 * are reading this in", and a follow was not read inside one. For a COMMENT_LIKE the body the
 * notification refers to is the comment's, so it is not loaded at all: the panel says what
 * happened, not what was said.
 *
 * `followers` is filtered to the viewer's own row, which is how "do you follow them back" is
 * answered for the whole page without a second statement — the same filtered-relation trick as
 * the memberships above, and a primary-key lookup per row under the join strategy. That is why
 * this is a function of the viewer rather than a constant: `listFollows` pays a `followedAmong`
 * query for the same answer because its rows are the follows themselves, but here the person is
 * already being joined and the flag rides along. */
const notificationInclude = (viewerId) => ({
    actor: {
        select: {
            handle: true,
            displayName: true,
            firstName: true,
            lastName: true,
            vocation: true,
            avatarUrl: true,
            memberships: {
                where: { status: "APPROVED", role: "ADMIN" },
                select: { orgId: true },
            },
            followers: {
                where: { followerId: viewerId },
                select: { followerId: true },
            },
        },
    },
    post: { select: { orgId: true, deletedAt: true, org: { select: { name: true } } } },
    /* The date a reminder or a cancellation is about. Null on every other kind, and joined
     * unconditionally because the alternative is a second read for a row the panel is already
     * assembling — under the join strategy an always-null left join costs nothing worth
     * measuring. */
    signupSlot: {
        select: {
            id: true,
            sheetId: true,
            startsAt: true,
            canceledAt: true,
            sheet: { select: { title: true } },
        },
    },
    /* The rota a publication is about. A reminder reaches its sheet through the slot above; a
     * publication has no slot, because it is about the rota rather than about a date on it. */
    signupSheet: { select: { id: true, title: true } },
    /* The group an admission is about. It carries the name the row prints and the id the tap
     * selects, and it is the group the actor's check is resolved against — an admin who added
     * you wears it here for the same reason they wear it over a post in that group. */
    org: { select: { id: true, name: true } },
})

/* The rows a panel and a bell may count: everything except an event inside a post that has
 * since been soft-deleted.
 *
 * The `postId IS NULL` arm is what keeps a FOLLOW visible. Prisma reads `post: {...}` on an
 * optional relation as "there is a post, and it matches", so the filter on its own would hide
 * every notification that happens inside no post at all.
 *
 * It goes in under `AND` rather than being spread beside `keysetWhere`, whose result is itself
 * an `OR` — two `OR` keys in one object literal and the later one silently wins. */
const visibleSubject = { OR: [{ postId: null }, { post: { deletedAt: null } }] }

/* One page of the viewer's notifications, newest first.
 *
 * Scoped by `recipientId` alone, which is the whole authorization story here: a
 * notification is addressed to exactly one person and there is no id a caller could supply
 * to widen that. No `requireMembership` — this is not group-scoped content, and it must not
 * be: a like on a post in a parish you have since stopped reading is still a thing that
 * happened to you.
 *
 * Rows whose post has been soft-deleted are excluded rather than deleted, because the post
 * may be restored. The filter is on the joined relation, so it costs no extra statement. */
export const listNotifications = async (viewer, { limit, cursor }) => {
    const rows = await prisma.notification.findMany({
        where: {
            recipientId: viewer.id,
            AND: [visibleSubject],
            ...keysetWhere(cursor, "desc"),
        },
        orderBy: keysetOrder("desc"),
        take: limit + 1,
        include: notificationInclude(viewer.id),
        relationLoadStrategy: "join",
    })

    return keysetPage(rows, limit, projectNotification)
}

/* How many the bell should light up for.
 *
 * A `count` rather than a page, because the chrome needs the number on boot and the list
 * only when the panel opens — two questions with very different frequencies, and answering
 * the cheap one with the expensive one would load a page of rows on every sign-in to render
 * a dot. It is an index-only scan over `(recipient_id, read_at)`.
 *
 * The soft-deleted-post filter matches `listNotifications` deliberately: a badge counting
 * rows the panel then refuses to show is a badge that cannot be cleared by reading. */
export const unreadCount = async (viewer) =>
    prisma.notification.count({
        where: { recipientId: viewer.id, readAt: null, AND: [visibleSubject] },
    })

/* Marks everything the viewer holds as read and answers the resulting tally.
 *
 * Returns the count — which is zero — rather than 204 for the same reason the like toggles
 * return `{ liked, likes }`: the client applied this optimistically and reconciles against
 * the server's answer instead of re-reading to find out what happened.
 *
 * Deliberately not scoped to the ids the panel had loaded. The bell counts *everything*
 * unread, so marking only the visible page would clear the panel and leave the dot lit with
 * no way to reach what is still counting. */
export const markNotificationsRead = async (viewer) => {
    await prisma.notification.updateMany({
        where: { recipientId: viewer.id, readAt: null },
        data: { readAt: new Date() },
    })

    return { unread: 0 }
}

/* ---------------------------------------------------------------------------
 * Writes — builders, spliced into the caller's transaction. See the header.
 * ------------------------------------------------------------------------- */

/* The unique key one actor's event on one subject occupies. */
const key = ({ recipientId, actorId, type, subjectId }) => ({
    recipientId_actorId_type_subjectId: { recipientId, actorId, type, subjectId },
})

/* The write for "somebody liked this". Null when the liker is the author — nobody needs
 * telling about their own tap, and a row that exists only to be filtered out on read is a
 * row that will eventually be forgotten about and shown.
 *
 * An upsert rather than a create, because the unique key is what makes a re-like idempotent
 * and there is no reason for the second one to fail. Re-liking refreshes `createdAt` and
 * clears `readAt`, so the notification returns to the top of the panel and lights the bell
 * again: the event genuinely happened again, and a row silently sitting where it was read a
 * week ago is worse than one that repeats. */
export const notifyLike = ({ recipientId, actorId, type, subjectId, postId }) => {
    if (recipientId === actorId) return null

    const now = new Date()
    return prisma.notification.upsert({
        where: key({ recipientId, actorId, type, subjectId }),
        create: { recipientId, actorId, type, subjectId, postId, createdAt: now },
        update: { createdAt: now, readAt: null },
    })
}

/* The write for "they took it back". `deleteMany`, never `delete`: there may be no row —
 * a self-like, or a like from before this table existed — and a toggle must not fail
 * because the notification it is retracting was never written. */
export const unnotifyLike = ({ recipientId, actorId, type, subjectId }) => {
    if (recipientId === actorId) return null

    return prisma.notification.deleteMany({
        where: { recipientId, actorId, type, subjectId },
    })
}

/* The write for "somebody commented on your post". Null when the commenter is the author,
 * matching `notifyLike`.
 *
 * **The subject is the comment, not the post.** Keying on the post would collapse a whole
 * conversation into one row per person, which cannot name *which* comment to open to and
 * leaves `unnotifyComment` nothing to identify when one of them is deleted. One row per
 * comment also means the unique key cannot collide, so this is a `create` rather than the
 * like's upsert.
 *
 * Takes the transaction client for the reason `notifyNewPost` does: it needs the id of the
 * row created alongside it. */
export const notifyComment = (tx, { recipientId, actorId, commentId, postId }) => {
    if (recipientId === actorId) return null

    return tx.notification.create({
        data: { recipientId, actorId, type: "POST_COMMENT", subjectId: commentId, postId },
    })
}

/* Retracts every notification whose subject is a comment that has just been deleted — both
 * the "liked your comment" rows and the "commented on your post" row the comment itself
 * wrote.
 *
 * **The one gap the cascade cannot cover.** `postId` carries the foreign key, so deleting a
 * post takes its notifications with it — including the ones about its comments. A *comment*
 * has no such column, and could not usefully have one: its deletion is soft, so there is no
 * DDL-level event to cascade from at all. Without this the panel keeps saying "liked your
 * comment" for a comment no longer in the thread, the unread tally counts it, and tapping
 * the row opens a post the comment does not appear in.
 *
 * Filtered on `type` as well as `subjectId`: the two comment-subject types are named, so a
 * future type keyed on something else cannot be swept up by a deletion it has nothing to do
 * with.
 *
 * Takes the transaction client, like `notifyNewPost` and for the same reason as everything
 * else here: the retraction commits with the deletion that justifies it or not at all. */
export const unnotifyComment = (tx, commentId) =>
    tx.notification.deleteMany({
        where: { type: { in: ["COMMENT_LIKE", "POST_COMMENT"] }, subjectId: commentId },
    })

/* The write for "somebody started following you".
 *
 * **The subject is the actor.** A follow is identified by the pair alone — there is no post
 * and no comment to point at — so keying on the follower is what makes the unique key mean one
 * row per follower, and what gives `unnotifyFollow` a row to delete. It is also where the
 * panel row goes when it is tapped.
 *
 * `postId` is left null: this is the one event that happens inside no post at all. See the
 * `Notification` model, and `visibleSubject` above for what that costs the reads.
 *
 * An upsert for the reason a like is one — follow → unfollow → follow settles at a single row,
 * and refreshing `createdAt`/`readAt` returns it to the top of the panel and lights the bell,
 * because the follow genuinely happened again. */
export const notifyFollow = ({ recipientId, actorId }) => {
    const now = new Date()
    return prisma.notification.upsert({
        where: key({ recipientId, actorId, type: "FOLLOW", subjectId: actorId }),
        create: { recipientId, actorId, type: "FOLLOW", subjectId: actorId, createdAt: now },
        update: { createdAt: now, readAt: null },
    })
}

/* The write for "they unfollowed". `deleteMany`, never `delete`, matching `unnotifyLike`:
 * there may be no row — a follow made before this type existed — and a toggle must not fail
 * because the notification it is retracting was never written. */
export const unnotifyFollow = ({ recipientId, actorId }) =>
    prisma.notification.deleteMany({
        where: { recipientId, actorId, type: "FOLLOW", subjectId: actorId },
    })

/* Who hears about a new post: every APPROVED member of the group except whoever wrote it.
 *
 * Read *outside* the publish transaction on purpose. It is the one statement here that does
 * not have to be atomic with the post — somebody admitted in the same second either makes
 * this page of members or does not, and neither answer is wrong — so keeping it out is what
 * lets the transaction hold a connection for two writes rather than for a read as well. */
export const newPostRecipients = async (orgId, actorId) => {
    const rows = await prisma.membership.findMany({
        where: { orgId, status: "APPROVED", profileId: { not: actorId } },
        select: { profileId: true },
    })

    return rows.map((row) => row.profileId)
}

/* Tells a group its admin has published.
 *
 * **This is a fan-out, and it is the one write here that is.** A like notifies one person —
 * the author — so it is a row. A post notifies a whole parish, so it is a row per member,
 * written with a single `createMany`. That is fan-out-on-write, and the tradeoff is worth
 * stating: it costs rows proportional to the group at publish time, in exchange for a panel
 * that is one query over one table however many kinds of event it holds. The alternative —
 * deriving "posts since you last looked" at read time — costs nothing to write but makes the
 * panel a union of two different shapes, and there is no per-row `readAt` to hang the unread
 * tally on. Revisit it if a group ever runs to tens of thousands of members; a parish or a
 * diocese does not.
 *
 * Takes the transaction client rather than `prisma`, because unlike the like builders this
 * one cannot be handed back to be spliced into an array: it needs the id of the post created
 * in the same transaction, which is exactly the dependency the array form cannot express.
 * That is the documented reason to reach for the interactive form — see the note on
 * `deleteComment` in posts.service.js.
 *
 * `skipDuplicates` because the unique key already says one row per member per post, and a
 * retried publish should be a no-op rather than a 500. */
export const notifyNewPost = (tx, { recipients, actorId, postId }) => {
    if (recipients.length === 0) return null

    return tx.notification.createMany({
        data: recipients.map((recipientId) => ({
            recipientId,
            actorId,
            type: "NEW_POST",
            /* The post is both what happened and where it happened. */
            subjectId: postId,
            postId,
        })),
        skipDuplicates: true,
    })
}

/* "Fr. Alexander added you to Holy Trinity Cathedral."
 *
 * **The subject is the group**, which is the only thing the event is about — there is no post
 * and no comment to point at. Under the unique key that means one row per admin per group, so
 * an admin who revokes somebody and later re-admits them settles at a single row rather than
 * accumulating one per change of mind. An upsert for the reason a like is one: the second
 * admission genuinely happened, so refreshing `createdAt` and `readAt` returns the row to the
 * top of the panel and lights the bell again.
 *
 * Takes the client because both callers need a different one. Admitting somebody already known
 * to the app splices this into the array form beside the membership upsert; admitting a new
 * person has to pass the transaction client, because the `Profile` this row points at is
 * created in that same transaction and the foreign key would otherwise have nothing to hold.
 *
 * `orgId` is written twice on purpose — as the subject, which is what makes the unique key
 * mean what it says, and as the foreign key, which is what names the group at read time and
 * what takes the row with the group if it is ever deleted. Same shape as `signupSheetId`. */
export const notifyAddedToGroup = (client, { recipientId, actorId, orgId }) => {
    const now = new Date()

    return client.notification.upsert({
        where: key({ recipientId, actorId, type: "ADDED_TO_GROUP", subjectId: orgId }),
        create: {
            recipientId,
            actorId,
            type: "ADDED_TO_GROUP",
            subjectId: orgId,
            orgId,
            createdAt: now,
        },
        update: { createdAt: now, readAt: null },
    })
}

/* ---------------------------------------------------------------------------
 * Sign-ups
 *
 * The two kinds of event a rota produces, and they are shaped differently from everything
 * above for one reason: **nobody did them to you**. A like has an actor; a reminder has a
 * clock, and a cancellation has an admin acting on the parish's behalf rather than on yours.
 * See the note on `actorId` below, which is where that shows up in the schema.
 * ------------------------------------------------------------------------- */

/* "Coffee hour is on Sunday. You signed up."
 *
 * **The actor is the recipient**, and that is the least-bad answer to a column that cannot be
 * null. `Notification.actorId` is non-null and carries a foreign key, and every other kind
 * genuinely has somebody behind it; a reminder does not. Pointing it at the reader keeps the
 * unique key below meaningful, keeps the cascade correct, and costs nothing at render time
 * because the panel draws a calendar glyph for this type rather than an avatar — see
 * `<NotificationRow/>`. The alternative, making the column nullable, would put a null check
 * into every read of the hottest notification query in the app to serve the rarest kind.
 *
 * **The subject is the reminder row, not the claim.** One sign-up produces a nudge a week out
 * and another a day out; keying both on the claim would collapse them into one row under
 * `@@unique([recipientId, actorId, type, subjectId])`, and the second reminder — the one that
 * actually gets somebody to turn up — would silently overwrite the first instead of arriving.
 *
 * A builder, like the like ones: it returns the operation so `sendDueReminders` can commit the
 * rows in the same transaction that marks the reminders sent. A notification for a reminder
 * that was then not marked sent is a notification a second run would write again. */
export const notifySignupReminder = (reminders) => {
    if (reminders.length === 0) return null

    return prisma.notification.createMany({
        data: reminders.map((reminder) => ({
            recipientId: reminder.claim.profileId,
            actorId: reminder.claim.profileId,
            type: "SIGNUP_REMINDER",
            subjectId: reminder.id,
            signupSlotId: reminder.claim.slotId,
        })),
        /* The unique key already says one row per reminder, so a re-run is a no-op rather than
         * a 500 — the same reason `notifyNewPost` carries it. */
        skipDuplicates: true,
    })
}

/* "There is a new sign-up sheet: Coffee hour."
 *
 * A fan-out over the group, like `notifyNewPost` and for the same reason — a rota nobody knows
 * about gets no volunteers, and a parish should not have to go looking for one. The recipients
 * come from `newPostRecipients`, which is already "every approved member except the person who
 * did it" and has nothing post-specific in it.
 *
 * Takes the transaction client rather than being a builder, because it needs the id of the sheet
 * created alongside it — the same dependency that makes `notifyNewPost` interactive. */
export const notifySignupPublished = (tx, { recipients, actorId, sheetId }) => {
    if (recipients.length === 0) return null

    return tx.notification.createMany({
        data: recipients.map((recipientId) => ({
            recipientId,
            actorId,
            type: "SIGNUP_PUBLISHED",
            subjectId: sheetId,
            signupSheetId: sheetId,
        })),
        skipDuplicates: true,
    })
}


/* "The soup kitchen on Saturday has been cancelled."
 *
 * A fan-out like `notifyNewPost`, over the people who had signed up rather than over the
 * group: cancelling a date is only news to somebody who was going to be there.
 *
 * The subject is the **slot**, because there is one cancellation per date however many
 * reminders were pending on it — so an admin who cancels, restores and cancels again leaves
 * one row rather than three, which is what the unique key is for.
 *
 * Returns an **array** rather than a single operation, so the caller can spread it into the
 * `$transaction([...])` it was already running whether or not there is anybody to tell. */
export const notifySignupCanceled = ({ recipients, actorId, slot }) => {
    if (recipients.length === 0) return []

    return [
        prisma.notification.createMany({
            data: recipients.map((recipientId) => ({
                recipientId,
                actorId,
                type: "SIGNUP_CANCELED",
                subjectId: slot.id,
                signupSlotId: slot.id,
            })),
            skipDuplicates: true,
        }),
        /* A cancellation is worth interrupting somebody for even if they have already read a
         * notification about this slot, so a repeat clears the read mark the way `notifyFollow`
         * does. Cheap: it touches the rows just written plus at most one stale one per person. */
        prisma.notification.updateMany({
            where: {
                recipientId: { in: recipients },
                type: "SIGNUP_CANCELED",
                subjectId: slot.id,
            },
            data: { readAt: null, createdAt: new Date() },
        }),
    ]
}

/* ---------------------------------------------------------------------------
 * Delivery — the push half. See the header for why these run after the commit.
 * ------------------------------------------------------------------------- */

/* Assembles one FCM HTTP v1 message.
 *
 * **The destination in `data` is the load-bearing field, not the title.** Tapping a push has
 * to open the thing it is about, so the destination travels in the payload: `postId` for
 * everything that happened inside a post, which the client opens by pathname as
 * `openSlide("/p/<id>")`, and `handle` for a follow, which opens that person's card. Every
 * value in `data` must be a string — FCM rejects the whole message otherwise, with a 400 that
 * does not say so — which is why the one that does not apply is omitted rather than sent
 * null.
 *
 * `notification` (rather than a data-only message) is what makes the OS draw the banner while
 * the app is backgrounded or dead. A data-only message would need the app to be running to
 * render anything, which is the one case push exists for.
 *
 * ── The actor's picture ──────────────────────────────────────────────────────
 *
 * `image` is the face of whoever did the thing, and it is a **URL the OS fetches**, not bytes
 * we send. That works because the `media` bucket is public-read (see `scripts/setup-storage.mjs`)
 * — a signed URL would expire while the phone was asleep, which is precisely when a push
 * matters. Omitted when the person has no picture, for the same reason `postId` is: FCM types
 * every field and a null fails the whole send.
 *
 * It is passed through `pushableImage` rather than straight off the column, because a phone
 * has no origin to resolve a relative path against and a malformed `image` does not fail
 * quietly — it is a 400 on the whole message, identically for every recipient. See that
 * helper.
 *
 * **It is not the small round icon, and no FCM field is.** Android draws it as the expanded
 * notification's picture and as the thumbnail on the collapsed row; the little circle stays
 * the app icon, because `android.notification.icon` takes a bundled drawable name and cannot
 * take a URL. On iOS `mutable-content` plus `fcm_options.image` is the documented path, and
 * it needs a Notification Service Extension in the iOS target to actually render — there is
 * none yet, so the field is inert there and the banner is text. Both are sent because the
 * payload is then already right for the day the extension lands.
 *
 * **No badge count.** iOS would happily take one, but it is per recipient, so setting it on a
 * fan-out means a `count(*)` per member of the parish before a single push goes out — a round
 * trip per person to decorate an icon. The bell inside the app is the honest tally and it is
 * already free. */
/* An avatar the OS on a phone can actually fetch, or null.
 *
 * `Profile.avatarUrl` holds two shapes. A picture somebody uploaded is an absolute URL into
 * the public `media` bucket, which is what this wants. A dev fixture is a path like
 * `/img/mock/priest-alexander.png`, which the client resolves through `appPath` against the
 * origin it is running on — and a push has no such origin: the payload is handed to Google and
 * rendered by a phone that knows nothing about this deployment.
 *
 * Dropping the unusable one rather than sending it is the whole point. FCM rejects a malformed
 * `notification.image` with a 400 on the *message*, not on the token, so it fails identically
 * for every recipient — a like that would have gone through silently loses its notification
 * instead of merely losing its picture. `sendOne` in `push.js` is written to tell that class of
 * failure apart precisely because it is not recoverable by retrying. */
const pushableImage = (url) => (/^https?:\/\//i.test(url ?? "") ? url : null)

const message = ({
    title,
    body,
    postId = null,
    handle = null,
    sheetId = null,
    conversationId = null,
    orgId = null,
    image = null,
    type,
}) => ({
    notification: { title, body, ...(image ? { image } : {}) },
    data: {
        type,
        ...(postId ? { postId } : {}),
        ...(handle ? { handle } : {}),
        /* A sign-up's destination is the Events surface, which is a static route — so unlike a
         * post there is no id in the path to open. The sheet's id travels anyway, because the
         * surface can then expand the right rota rather than dropping the reader at the top of
         * a list of them. */
        ...(sheetId ? { sheetId } : {}),
        ...(conversationId ? { conversationId } : {}),
        /* A group's destination is the feed, which is a static route: the id selects which
         * group the app is looking at rather than naming anything in the path. */
        ...(orgId ? { orgId } : {}),
    },
    android: {
        /* `high` is what wakes a dozing device; the default is `normal`, which Android is
         * free to hold until the next maintenance window — minutes to hours later. */
        priority: "high",
        /* The tag collapses repeats about the same subject into one banner, so it follows
         * whichever destination this message carries. */
        notification: {
            sound: "default",
            tag: postId ?? handle ?? sheetId ?? conversationId ?? orgId,
        },
    },
    apns: {
        payload: { aps: { sound: "default", ...(image ? { "mutable-content": 1 } : {}) } },
        ...(image ? { fcm_options: { image } } : {}),
    },
})

/* Tokens → send → forget the dead ones. The one path every push takes.
 *
 * Swallows everything. A caller is a fire-and-forget after a committed write and has nothing
 * to do with a failure: the notification row exists either way, and the panel is the source
 * of truth the app actually reads. */
const deliver = async (recipientIds, payload) => {
    if (!pushConfigured()) return

    try {
        const tokens = await pushTokensFor(recipientIds)
        if (tokens.length === 0) return

        const dead = await sendPush(tokens, payload)
        await prunePushTokens(dead)
    } catch (error) {
        console.error("[push] delivery failed", error)
    }
}

/* Fires a delivery without making the caller wait for it.
 *
 * **Correct because the web target is a long-lived Node server** (`next start`) — the process
 * outlives the response, so a floating promise runs to completion. If this app ever moves to
 * serverless functions, where the runtime may freeze the moment the response is returned,
 * this must become the platform's `waitUntil`. That is the same deployment assumption the
 * session pooler on port 5432 rests on; see the datasource block in schema.prisma. */
const detach = (promise) => {
    promise.catch(() => {})
}

/* "Dn. Paul liked your post."
 *
 * Takes the actor as the viewer object the route already holds, so the name and the picture
 * both cost nothing — `displayName` is the same function the feed uses, which is what keeps a
 * push and the panel row it corresponds to from addressing the same deacon two different ways.
 *
 * Silent for a self-like, matching `notifyLike`: there is no row, so there is nothing to
 * deliver. The check is repeated here rather than inferred from `notifyLike` returning null,
 * because these are two independent decisions that happen to agree, and coupling them would
 * mean a future notification type could only push if it also wrote a row this way. */
export const pushLike = ({ recipientId, actor, type, postId }) => {
    if (recipientId === actor.id) return

    detach(
        deliver(
            [recipientId],
            message({
                title: displayName(actor),
                body: type === "COMMENT_LIKE" ? "liked your comment" : "liked your post",
                postId,
                image: pushableImage(actor.avatarUrl),
                type,
            }),
        ),
    )
}

/* "Dn. Paul commented on your post."
 *
 * **No excerpt of what was said**, though the body is right there at the call site: the panel
 * row does not load a comment's text (see `notificationInclude`), and a banner that quoted it
 * would say more on a lock screen than the row it corresponds to says in the app. */
export const pushComment = ({ recipientId, actor, postId }) => {
    if (recipientId === actor.id) return

    detach(
        deliver(
            [recipientId],
            message({
                title: displayName(actor),
                body: "commented on your post",
                postId,
                image: pushableImage(actor.avatarUrl),
                type: "POST_COMMENT",
            }),
        ),
    )
}

/* "Dn. Paul followed you."
 *
 * The only push whose destination is a person rather than a post, so it carries `handle` and
 * no `postId` — see `message`. Nothing to say beyond who: a follow has no body, and the panel
 * row says the same two words. */
export const pushFollow = ({ recipientId, actor }) => {
    detach(
        deliver(
            [recipientId],
            message({
                title: displayName(actor),
                body: "followed you",
                handle: actor.handle,
                image: pushableImage(actor.avatarUrl),
                type: "FOLLOW",
            }),
        ),
    )
}

/* "Holy Trinity Cathedral — Dn. Paul posted."
 *
 * The group leads the title because that is what tells a reader whether this concerns them:
 * somebody in a diocese of six parishes needs to know which one is speaking before they need
 * to know who. The panel row makes the same choice.
 *
 * `recipients` is already the parish minus the author — `newPostRecipients` excluded them —
 * so there is no self-check to repeat here.
 *
 * **The one push with no picture**, because the three that carry one are titled with a person
 * and this one is titled with a group. The author's face under the cathedral's name answers a
 * question nobody asked; the post's own photo would be the right image and is the thing to add
 * if this ever gets one, which means plumbing the media rows down to here. */
export const pushNewPost = ({ recipients, actor, orgName, postId }) => {
    if (recipients.length === 0) return

    detach(
        deliver(
            recipients,
            message({
                title: orgName || "New post",
                body: `${displayName(actor)} posted`,
                postId,
                type: "NEW_POST",
            }),
        ),
    )
}

/* "Holy Trinity Cathedral — Fr. Alexander added you."
 *
 * Titled with the group, like `pushNewPost`: the news is which parish somebody now belongs to,
 * and who did the admitting is the second question.
 *
 * **Only ever sent to somebody who has signed in before.** A person provisioned a moment ago
 * has no device registered and no app installed, so `admitOne` sends them the invitation email
 * instead — which is the delivery that can carry a download link. This is the same row either
 * way. */
export const pushAddedToGroup = ({ recipientId, actor, orgName, orgId }) => {
    detach(
        deliver(
            [recipientId],
            message({
                title: orgName || "New group",
                body: `${displayName(actor)} added you`,
                orgId,
                type: "ADDED_TO_GROUP",
            }),
        ),
    )
}

/* "Coffee hour — Sunday at 11 AM". The nudge itself.
 *
 * Titled with the rota rather than with a person, like `pushNewPost` and for the same reason:
 * there is nobody to name. The body carries the date because a banner read on a lock screen is
 * often the whole of what somebody sees — a reminder they have to open the app to understand
 * is a reminder that has not reminded them of anything.
 *
 * One `deliver` per recipient rather than one for all of them, unlike the fan-outs above: a
 * batch of reminders is a batch of *different* shifts, and every banner has to name its own. */
export const pushSignupReminder = ({ recipientId, title, sheetId, when }) => {
    detach(
        deliver(
            [recipientId],
            message({
                title,
                body: `You signed up for ${when}`,
                sheetId,
                type: "SIGNUP_REMINDER",
            }),
        ),
    )
}

/* "Cancelled: soup kitchen, Saturday."
 *
 * The one push in the app that is *more* urgent than the row it delivers, which is why it says
 * "Cancelled" first: somebody who reads only the first word of the banner has still been told
 * the thing that matters, and somebody who reads none of it and turns up has been failed. */
export const pushSignupCanceled = ({ recipients, title, sheetId, when }) => {
    if (recipients.length === 0) return

    detach(
        deliver(
            recipients,
            message({
                title: `Cancelled: ${title}`,
                body: when ? `${when} is not happening` : "This date is not happening",
                sheetId,
                type: "SIGNUP_CANCELED",
            }),
        ),
    )
}

/* "Coffee hour — a new sign-up sheet."
 *
 * Titled with the group rather than with the admin, exactly as `pushNewPost` is: the parish is
 * asking, and the person who typed it is not the point. The body names the rota, because that is
 * what decides whether somebody opens it. */
export const pushSignupPublished = ({ recipients, orgName, title, sheetId }) => {
    if (recipients.length === 0) return

    detach(
        deliver(
            recipients,
            message({
                title: orgName || "New sign-up sheet",
                body: `${title} needs people`,
                sheetId,
                type: "SIGNUP_PUBLISHED",
            }),
        ),
    )
}

/* "Fr. Alexander — New message." The one push with no Notification row behind it: a
 * direct message's record is the envelope itself, and the panel deliberately does not
 * list conversations (see messages.service.js). The body never says more than "New
 * message", because the server has only ciphertext and it must stay that way — the
 * banner's job is who, not what.
 *
 * A recipient who has not accepted the thread gets no name and no face either:
 * their inbox row is blurred until they accept, and a lock screen must not say more
 * than the app would. */
export const pushMessage = ({ recipientId, actor, conversationId, request = false }) => {
    detach(
        deliver(
            [recipientId],
            message({
                title: request ? "Grapevine" : displayName(actor),
                body: request ? "New message request" : "New message",
                conversationId,
                image: request ? null : pushableImage(actor.avatarUrl),
                type: "MESSAGE",
            }),
        ),
    )
}
