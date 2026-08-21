import "server-only"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { keysetOrder, keysetPage, keysetWhere } from "@/lib/server/cursor"
import { forbidden, invalid, notFound } from "@/lib/server/errors"
import { membershipIn, requireMembership, readableOrgIds } from "@/lib/server/auth"
import { projectComment, projectPost } from "@/lib/server/projections"

/* Posts and comments: all business logic and all data access.
 *
 * Services never see a `Request` or a `Response` — they take a viewer and plain
 * arguments, and throw `AppError` on failure. That is what keeps the route handlers three
 * lines long, and it is also what would let a GraphQL resolver layer (or a job, or a test)
 * call exactly these functions without going through HTTP.
 *
 * **Every read is scoped to the viewer.** There is no "list all posts" here, and there
 * must never be one: a post is only visible through an APPROVED membership in the
 * organization that owns it. The scoping is applied in the query's `where`, not filtered
 * out afterwards, so an unauthorized row is never loaded in the first place. */

/* Everything needed to render whoever wrote something.
 *
 * The name arrives in parts because the client composes it (see `projectAuthor`), and
 * `vocation` rides along because it is what supplies the title.
 *
 * `memberships` is how the blue check is answered without a stored flag. It is narrowed to
 * the author's APPROVED **admin** memberships — a handful of ids at most, and usually one —
 * and `projectAuthor` checks whether the post's own organization is among them. Filtering
 * here rather than in JS matters: an unfiltered include would pull every membership of
 * every author on a feed page to answer a boolean. */
const authorSelect = {
    handle: true,
    firstName: true,
    lastName: true,
    vocation: true,
    avatarUrl: true,
    memberships: {
        where: { status: "APPROVED", role: "ADMIN" },
        select: { orgId: true },
    },
}

/* Load every relation in the query that asks for them, rather than one statement per
 * relation.
 *
 * Prisma's default strategy issues a separate SELECT for each `include` and stitches the
 * rows together in the client — six statements for one page of the feed, each paying a
 * full round trip to the pooler. `join` compiles the same shape into one statement with
 * lateral joins. It is a Postgres-only strategy, which this project is, and it needs the
 * `relationJoins` preview feature in schema.prisma.
 *
 * Applied to reads that fan out. A write's `include` is one row's relations and not worth
 * thinking about either way — those are left on the default. */
const JOIN = { relationLoadStrategy: "join" }

/* The relations every post projection needs. Declared once so the feed, the detail
 * fetch, and a freshly-created post cannot drift into returning different shapes for the
 * same entity — which is exactly the bug that makes a card change as you open it. */
const postInclude = (viewerId) => ({
    org: { select: { name: true } },
    author: { select: authorSelect },
    media: { orderBy: { position: "asc" } },
    /* The viewer's own like, as a 0-or-1 row. A filtered relation include is one join,
     * where asking per post would be one query per card. */
    likes: { where: { profileId: viewerId }, select: { profileId: true }, take: 1 },
})

const commentInclude = (viewerId) => ({
    author: { select: authorSelect },
    likes: { where: { profileId: viewerId }, select: { profileId: true }, take: 1 },
})

/* The social-proof person on a card — "<name> and 17 others" — for a whole page of posts in
 * one query.
 *
 * Selects the name *parts* rather than a name, because the card composes it with
 * `displayName()` exactly as it composes a byline — so a deacon who liked a post reads as
 * "Dn. Paul and 17 others" and not as his given and family name, which is the one place
 * he is never called that.
 *
 * `DISTINCT ON` is Postgres-specific and has no Prisma Client equivalent, which is why
 * this drops to raw SQL. The alternative shapes are both worse: a nested `take: 1` include
 * cannot be used, because the viewer's own like already occupies the one `likes` include
 * Prisma allows per query, and loading the likes and reducing in JS would pull every like
 * row of a popular post to name one person.
 *
 * Identifiers are unquoted because the schema maps every model and field to snake_case
 * (see the Naming note in prisma/schema.prisma). If a column here stops resolving, check
 * that its `@map` still matches — the Prisma-side camelCase name is not what Postgres
 * knows it as.
 *
 * Returns a Map of postId → `{ handle, firstName, lastName, vocation }`. Posts liked only
 * by the viewer are simply absent. */
const likedByNames = async (postIds, viewerId) => {
    if (postIds.length === 0) return new Map()

    const rows = await prisma.$queryRaw`
        SELECT DISTINCT ON (l.post_id)
            l.post_id AS "postId",
            p.handle AS "handle",
            p.first_name AS "firstName",
            p.last_name AS "lastName",
            p.vocation AS "vocation"
        FROM post_like l
        JOIN profile p ON p.id = l.profile_id
        WHERE l.post_id IN (${Prisma.join(postIds)})
          AND l.profile_id <> ${viewerId}::uuid
        ORDER BY l.post_id, l.created_at DESC
    `

    return new Map(
        rows.map((row) => [
            row.postId,
            {
                handle: row.handle,
                firstName: row.firstName,
                lastName: row.lastName,
                vocation: row.vocation,
            },
        ]),
    )
}

/* Loads a post the viewer is allowed to see, or throws. Returns the post *and* the
 * membership that authorized it, because the caller usually needs the second too — whether
 * the viewer administers this post's group decides who wears the check and who may delete a
 * comment, and re-querying for it would be a second round trip per request.
 *
 * The membership check is what makes this safe to call with an arbitrary id from the URL.
 * A post in an organization the viewer has no APPROVED membership in reports 404 rather
 * than 403 — the same reasoning as `requireMembership`: confirming the post exists would
 * leak the contents of a parish the viewer was never admitted to. */
const loadReadablePost = async (viewer, postId, { include } = {}) => {
    const post = await prisma.post.findFirst({
        where: { id: postId, deletedAt: null },
        ...(include ? { ...JOIN, include } : {}),
    })
    if (!post) throw notFound("Post not found.")

    /* From the viewer `requireViewer` already loaded, not a second query. */
    const membership = membershipIn(viewer, post.orgId)
    if (membership?.status !== "APPROVED") throw notFound("Post not found.")

    return { post, membership }
}

/* May this viewer remove this comment?
 *
 * Two rules, and they are deliberately not one: a person owns what they wrote, and an admin
 * moderates the group they administer. Note the second is per-group — `membership` is the
 * viewer's membership in the *post's* organization, so administering a diocese grants
 * nothing over a parish's threads. */
const canDeleteComment = (viewerId, membership, comment) =>
    comment.authorId === viewerId || membership.role === "ADMIN"

/* May this viewer remove this post?
 *
 * **One rule, not two, and that is the difference from a comment.** A comment is a person
 * speaking, so its author owns it; a post is the *group* speaking, published under the
 * authority that publishing requires. So the answer is the same as the answer to "may you
 * publish here" — ADMIN of the post's organization — and it deliberately does not include
 * "the person who wrote it". An admin whose role is revoked stops being able to remove what
 * they posted, which is correct: they no longer speak for the parish. And any admin may
 * remove any other admin's post, which is what makes a parish with two priests workable.
 *
 * `membership` is the viewer's membership in the *post's* organization, resolved by the read
 * that authorized loading it — so administering a diocese grants nothing over a parish's
 * posts. */
const canDeletePost = (membership) => membership?.role === "ADMIN"

/* ---------------------------------------------------------------------------
 * Reads
 * ------------------------------------------------------------------------- */

/* One page of the viewer's feed, newest first.
 *
 * Scoped to one organization when `orgId` is given, and otherwise the union of every
 * organization the viewer has an APPROVED membership in. The union is written as a set
 * because it is about to be a wider one (a diocese contributing its parishes, and the
 * planned follow feature contributing people). A viewer with no approved memberships gets
 * an empty page, not an error: they are signed in and waiting on an admin, and the surface
 * says so.
 *
 * **`orgId` is an id from the client, so it is checked and not trusted.**
 * `requireMembership` is what makes it safe to interpolate into the query — without it the
 * parameter would be a read of any parish in the system by anyone holding a session, which
 * is the entire privacy boundary. It reports 404 for an organization the viewer was never
 * approved into, so the filter cannot be used to probe which ids exist.
 *
 * The parameter is optional rather than required because the union is still the honest
 * answer to "the viewer's feed", and keeping it reachable is what would let a future "All
 * groups" entry in the switcher work with no change to this contract. The client always
 * sends one today. */
export const listFeed = async (viewer, { limit, cursor, orgId = null }) => {
    if (orgId) requireMembership(viewer, orgId)
    const orgIds = orgId ? [orgId] : readableOrgIds(viewer)
    if (orgIds.length === 0) return { items: [], nextCursor: null }

    const rows = await prisma.post.findMany({
        where: { orgId: { in: orgIds }, deletedAt: null, ...keysetWhere(cursor, "desc") },
        orderBy: keysetOrder("desc"),
        take: limit + 1,
        include: postInclude(viewer.id),
        ...JOIN,
    })

    /* Resolve social proof for the page only — after the slice, so the extra
     * over-fetched row never costs a lookup. */
    const page = rows.slice(0, limit)
    const likedBy = await likedByNames(
        page.map((post) => post.id),
        viewer.id,
    )

    return keysetPage(rows, limit, (post) =>
        projectPost(post, {
            liked: post.likes.length > 0,
            likedBy: likedBy.get(post.id) ?? null,
            /* Per post, because a page can span several groups and the viewer may
             * administer one of them and not another. An in-memory scan of the viewer's
             * own memberships — a handful of rows already loaded — not a query. */
            canDelete: canDeletePost(membershipIn(viewer, post.orgId)),
        }),
    )
}

/* One post's full detail, by id.
 *
 * This endpoint is what frees post ids from build time — detail is fetched at runtime, so
 * there is no `/p/[postId]` route and no `generateStaticParams` anywhere near posts, which
 * is what the static export requires. See native-architecture.md → Dynamic routes at
 * scale. */
export const getPost = async (viewer, postId) => {
    const { post, membership } = await loadReadablePost(viewer, postId, {
        include: postInclude(viewer.id),
    })

    const likedBy = await likedByNames([post.id], viewer.id)

    return projectPost(post, {
        liked: post.likes.length > 0,
        likedBy: likedBy.get(post.id) ?? null,
        canDelete: canDeletePost(membership),
    })
}

/* Capped because the pinned block is fetched whole, with no cursor of its own. Anything
 * past the cap stays where it was written, in the chronological body below. */
const PINNED_OWN_COMMENTS = 20

/* One page of a post's comments: the viewer's own first (newest first), then the thread
 * oldest-first.
 *
 * Pinning is what keeps a reply where the viewer left it across a reload, agreeing with the
 * optimistic row the client already showed at the top. The pinned set is resolved on
 * *every* page because its ids are what the body excludes — skip that on page two and the
 * same comment is served twice. Only the first page carries the block itself, and
 * `nextCursor` still comes off the body's last row.
 *
 * The body's direction is "asc" against the feed's "desc"; the cursor helpers take it
 * explicitly because a mismatch silently repeats the first page rather than failing. */
export const listComments = async (viewer, postId, { limit, cursor }) => {
    /* The post was loaded to authorize the read; its `orgId` is then what decides which
     * commenters wear the admin check, and the membership that authorized it decides which
     * rows the viewer may delete. Both are carried into the projection rather than
     * re-queried per comment. */
    const { post, membership } = await loadReadablePost(viewer, postId)

    const own = await prisma.comment.findMany({
        where: { postId, authorId: viewer.id, deletedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PINNED_OWN_COMMENTS,
        include: commentInclude(viewer.id),
        ...JOIN,
    })
    const pinnedIds = own.map((comment) => comment.id)

    const rows = await prisma.comment.findMany({
        where: {
            postId,
            deletedAt: null,
            ...(pinnedIds.length > 0 ? { id: { notIn: pinnedIds } } : {}),
            ...keysetWhere(cursor, "asc"),
        },
        orderBy: keysetOrder("asc"),
        take: limit + 1,
        include: commentInclude(viewer.id),
        ...JOIN,
    })

    const project = (comment) =>
        projectComment(comment, {
            liked: comment.likes.length > 0,
            orgId: post.orgId,
            canDelete: canDeleteComment(viewer.id, membership, comment),
        })

    const page = keysetPage(rows, limit, project)
    if (cursor) return page

    return { ...page, items: [...own.map(project), ...page.items] }
}

/* ---------------------------------------------------------------------------
 * Writes
 * ------------------------------------------------------------------------- */

/* Creates a post in an organization the viewer administers.
 *
 * **This is the app's central permission rule**: only an ADMIN of the target organization
 * may post. `requireMembership` with a role is the whole enforcement, and it runs before
 * anything is written. Note it is per-organization — being an admin of one parish grants
 * nothing in another.
 *
 * Media is written in the same call so a post is never briefly visible without its
 * photos. `position` is assigned from array order, which is the carousel's order. */
export const createPost = async (viewer, { orgId, title, body, media = [] }) => {
    requireMembership(viewer, orgId, { role: "ADMIN" })

    const text = String(body ?? "").trim()
    if (!text) throw invalid("Post body is required.", { body: "Required" })

    const post = await prisma.post.create({
        data: {
            orgId,
            authorId: viewer.id,
            title: title?.trim() || null,
            body: text,
            media: {
                create: media.map((item, index) => ({
                    kind: item.kind ?? "IMAGE",
                    url: item.url,
                    width: item.width ?? null,
                    height: item.height ?? null,
                    mimeType: item.mimeType ?? null,
                    fileName: item.fileName ?? null,
                    sizeBytes: item.sizeBytes ?? null,
                    position: index,
                })),
            },
        },
        include: postInclude(viewer.id),
    })

    /* Freshly created: the author cannot have liked it, and nobody else has seen it. Whoever
     * just published it administers this group by definition of having got here, so it is
     * theirs to remove. */
    return projectPost(post, { liked: false, likedBy: null, canDelete: true })
}

/* Removes a post. Only an admin of the group it was published into — see `canDeletePost`
 * for why authorship grants nothing here.
 *
 * **A soft delete**, the same as a comment's and for a sharper reason: `Post.deletedAt` is
 * what every read already filters on, and stamping it leaves the thread, the likes, and the
 * record that something was moderated away intact. A hard delete would cascade the whole
 * conversation out of the database, which is not recoverable and is not what "remove this
 * from the feed" means. The media in storage is left alone for the same reason — the row
 * still points at it, and restoring a post that has lost its photos is not a restore.
 *
 * `updateMany` with `deletedAt: null` in its `where` rather than `update` by id: two admins
 * can reach for the same post at once, and a claim that has already been made should be a
 * no-op rather than an error. There is no tally to decrement — unlike a comment, nothing
 * counts posts — so this needs no transaction at all. */
export const deletePost = async (viewer, postId) => {
    const { membership } = await loadReadablePost(viewer, postId)

    if (!canDeletePost(membership)) {
        throw forbidden("Only group admins can delete a post.")
    }

    await prisma.post.updateMany({
        where: { id: postId, deletedAt: null },
        data: { deletedAt: new Date() },
    })
}

/* Toggles the viewer's like on a post and returns the resulting state.
 *
 * Returning `{ liked, likes }` rather than 204 is what lets the optimistic client
 * reconcile instead of re-fetching the post — see backend-architecture.md §5.
 *
 * The like row and the denormalized tally move inside one transaction, so the count can
 * never disagree with the rows that justify it. The unique constraint on
 * `(profileId, postId)` is the backstop: two taps racing each other cannot produce two
 * rows, and the loser surfaces as P2002, which is not an error here — it means the like
 * already exists, so the tally must not be incremented again.
 *
 * **A sequential (array) transaction, not an interactive one.** Which way the toggle goes
 * is known before the transaction opens — `existing` decides it — so nothing inside needs
 * to read a previous statement's result. That matters through Supabase's transaction
 * pooler: an interactive transaction holds a pooled connection across several
 * client-server round trips, while the array form is dispatched as one. Reach for
 * `$transaction(async tx => ...)` only when a later statement genuinely depends on an
 * earlier one's return value. */
export const togglePostLike = async (viewer, postId) => {
    await loadReadablePost(viewer, postId)

    const key = { profileId_postId: { profileId: viewer.id, postId } }
    const existing = await prisma.postLike.findUnique({ where: key })

    try {
        const [, post] = await prisma.$transaction(
            existing
                ? [
                      prisma.postLike.delete({ where: key }),
                      prisma.post.update({
                          where: { id: postId },
                          data: { likeCount: { decrement: 1 } },
                          select: { likeCount: true },
                      }),
                  ]
                : [
                      prisma.postLike.create({ data: { profileId: viewer.id, postId } }),
                      prisma.post.update({
                          where: { id: postId },
                          data: { likeCount: { increment: 1 } },
                          select: { likeCount: true },
                      }),
                  ],
        )

        return { liked: !existing, likes: post.likeCount }
    } catch (error) {
        /* A concurrent duplicate (P2002) or a row already gone (P2025) means the other
         * request applied the same toggle first. Report the settled truth rather than
         * failing a write the viewer perceives as having succeeded. */
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            (error.code === "P2002" || error.code === "P2025")
        ) {
            const [row, liked] = await Promise.all([
                prisma.post.findUnique({ where: { id: postId }, select: { likeCount: true } }),
                prisma.postLike.findUnique({
                    where: { profileId_postId: { profileId: viewer.id, postId } },
                }),
            ])
            return { liked: liked !== null, likes: row?.likeCount ?? 0 }
        }
        throw error
    }
}

/* The same toggle for a comment. Readability is inherited from the parent post, so the
 * check is on the post rather than on the comment. */
export const toggleCommentLike = async (viewer, commentId) => {
    const comment = await prisma.comment.findFirst({
        where: { id: commentId, deletedAt: null },
        select: { id: true, postId: true },
    })
    if (!comment) throw notFound("Comment not found.")

    await loadReadablePost(viewer, comment.postId)

    const key = { profileId_commentId: { profileId: viewer.id, commentId } }
    const existing = await prisma.commentLike.findUnique({ where: key })

    try {
        const [, row] = await prisma.$transaction(
            existing
                ? [
                      prisma.commentLike.delete({ where: key }),
                      prisma.comment.update({
                          where: { id: commentId },
                          data: { likeCount: { decrement: 1 } },
                          select: { likeCount: true },
                      }),
                  ]
                : [
                      prisma.commentLike.create({
                          data: { profileId: viewer.id, commentId },
                      }),
                      prisma.comment.update({
                          where: { id: commentId },
                          data: { likeCount: { increment: 1 } },
                          select: { likeCount: true },
                      }),
                  ],
        )

        return { liked: !existing, likes: row.likeCount }
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            (error.code === "P2002" || error.code === "P2025")
        ) {
            const [row, liked] = await Promise.all([
                prisma.comment.findUnique({
                    where: { id: commentId },
                    select: { likeCount: true },
                }),
                prisma.commentLike.findUnique({
                    where: { profileId_commentId: { profileId: viewer.id, commentId } },
                }),
            ])
            return { liked: liked !== null, likes: row?.likeCount ?? 0 }
        }
        throw error
    }
}

/* Posts a comment as the viewer.
 *
 * Any APPROVED member may comment — this is the one write a non-admin can perform, and it
 * is the reason `loadReadablePost` (membership) is the check here rather than
 * `requireMembership(..., { role: "ADMIN" })`.
 *
 * The server assigns the id, the author, and the timestamp — never the client — so the
 * created resource returned here is the authoritative row the client swaps its optimistic
 * one for. The post's tally moves in the same transaction as the insert. */
export const addComment = async (viewer, postId, text) => {
    const { post } = await loadReadablePost(viewer, postId)

    const body = String(text ?? "").trim()
    if (!body) throw invalid("Comment text is required.", { text: "Required" })

    /* Sequential, for the same reason as the like toggles: the tally bump does not read
     * anything the insert returns, so there is nothing to hold a pooled connection open
     * for. */
    const [comment] = await prisma.$transaction([
        prisma.comment.create({
            data: { postId, authorId: viewer.id, body },
            include: commentInclude(viewer.id),
        }),
        prisma.post.update({
            where: { id: postId },
            data: { commentCount: { increment: 1 } },
            select: { id: true },
        }),
    ])

    /* Freshly written by the viewer, so it is theirs to remove. */
    return projectComment(comment, { liked: false, orgId: post.orgId, canDelete: true })
}

/* Removes a comment: the author's own, or anyone's if the viewer administers the group the
 * post belongs to.
 *
 * **A soft delete.** `deletedAt` is stamped and the row stays, which is what every read
 * already filters on. Deleting it outright would take its likes with it and leave a parish
 * with no record that something was moderated away; the row is cheap and the history is
 * not recoverable once dropped. */
export const deleteComment = async (viewer, commentId) => {
    const comment = await prisma.comment.findFirst({
        where: { id: commentId, deletedAt: null },
        select: { id: true, postId: true, authorId: true },
    })
    if (!comment) throw notFound("Comment not found.")

    /* Readability is the parent post's, so this is also what resolves the viewer's role in
     * the group — and it 404s first for a post they may not read, so an outsider cannot
     * learn a comment id exists by being refused. */
    const { membership } = await loadReadablePost(viewer, comment.postId)

    if (!canDeleteComment(viewer.id, membership, comment)) {
        throw forbidden("You can only delete your own comments.")
    }

    /* **The one interactive transaction in this file**, and it earns it: the tally may only
     * be decremented if this request is the one that actually claimed the row. Two people
     * can delete the same comment at once — the author and an admin — and the array form
     * would run both decrements, permanently under-counting the thread. `updateMany` with
     * `deletedAt: null` in its `where` makes the claim atomic, and `count` is what the
     * decrement then depends on, which is exactly the condition the sequential form cannot
     * express. */
    await prisma.$transaction(async (tx) => {
        const { count } = await tx.comment.updateMany({
            where: { id: commentId, deletedAt: null },
            data: { deletedAt: new Date() },
        })
        if (count === 0) return

        await tx.post.update({
            where: { id: comment.postId },
            data: { commentCount: { decrement: 1 } },
            select: { id: true },
        })
    })
}
