import "server-only"

import { prisma } from "@/lib/db"
import { displayName } from "@/lib/name"
import { keysetOrder, keysetPage, keysetWhere } from "@/lib/server/cursor"
import { prunePushTokens, pushTokensFor } from "@/lib/server/devices.service"
import { projectNotification } from "@/lib/server/projections"
import { pushConfigured, sendPush } from "@/lib/server/push"

/* Notifications: the panel behind the bell, and the writes that fill it.
 *
 * Three kinds of event: somebody liked something you wrote (split by `type` into a like on a
 * post and a like on a comment), somebody commented on your post, and an admin published into
 * a group you belong to. The read side is a plain keyset page of the viewer's own rows,
 * identical for all of them; the write side is a builder per event, spliced into the
 * transaction the write it accompanies was already running.
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
 * against and, for a COMMENT_LIKE, the body the notification refers to is the comment's, so
 * it is not loaded at all: the panel says what happened, not what was said. */
const notificationInclude = {
    actor: {
        select: {
            handle: true,
            firstName: true,
            lastName: true,
            christianName: true,
            vocation: true,
            avatarUrl: true,
            memberships: {
                where: { status: "APPROVED", role: "ADMIN" },
                select: { orgId: true },
            },
        },
    },
    post: { select: { orgId: true, deletedAt: true, org: { select: { name: true } } } },
}

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
            post: { deletedAt: null },
            ...keysetWhere(cursor, "desc"),
        },
        orderBy: keysetOrder("desc"),
        take: limit + 1,
        include: notificationInclude,
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
        where: { recipientId: viewer.id, readAt: null, post: { deletedAt: null } },
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

/* The unique key one actor's like on one subject occupies. */
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

/* ---------------------------------------------------------------------------
 * Delivery — the push half. See the header for why these run after the commit.
 * ------------------------------------------------------------------------- */

/* Assembles one FCM HTTP v1 message.
 *
 * **`data.postId` is the load-bearing field, not the title.** Tapping a push has to open the
 * thing it is about, and the client resolves that by pathname — `openSlide("/p/<id>")` — so
 * the id has to travel in the payload. Every value in `data` must be a string; FCM rejects
 * the message outright otherwise, and it is a 400 with a message that does not say so.
 *
 * `notification` (rather than a data-only message) is what makes the OS draw the banner while
 * the app is backgrounded or dead. A data-only message would need the app to be running to
 * render anything, which is the one case push exists for.
 *
 * **No badge count.** iOS would happily take one, but it is per recipient, so setting it on a
 * fan-out means a `count(*)` per member of the parish before a single push goes out — a round
 * trip per person to decorate an icon. The bell inside the app is the honest tally and it is
 * already free. */
const message = ({ title, body, postId, type }) => ({
    notification: { title, body },
    data: { postId, type },
    android: {
        /* `high` is what wakes a dozing device; the default is `normal`, which Android is
         * free to hold until the next maintenance window — minutes to hours later. */
        priority: "high",
        notification: { sound: "default", tag: postId },
    },
    apns: {
        payload: { aps: { sound: "default" } },
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
 * Takes the actor as the viewer object the route already holds, so the name costs nothing —
 * `displayName` is the same function the feed uses, which is what keeps a push and the panel
 * row it corresponds to from addressing the same deacon two different ways.
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
                type: "POST_COMMENT",
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
 * so there is no self-check to repeat here. */
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
