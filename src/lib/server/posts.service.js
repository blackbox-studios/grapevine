import "server-only"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { keysetOrder, keysetPage, keysetWhere } from "@/lib/server/cursor"
import { invalid, notFound } from "@/lib/server/errors"
import { requireMembership, readableOrgIds } from "@/lib/server/auth"
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

/* Loads a post the viewer is allowed to see, or throws.
 *
 * The membership check is what makes this safe to call with an arbitrary id from the URL.
 * A post in an organization the viewer has no APPROVED membership in reports 404 rather
 * than 403 — the same reasoning as `requireMembership`: confirming the post exists would
 * leak the contents of a parish the viewer was never admitted to. */
const loadReadablePost = async (viewerId, postId, { include } = {}) => {
    const post = await prisma.post.findFirst({
        where: { id: postId, deletedAt: null },
        ...(include ? { include } : {}),
    })
    if (!post) throw notFound("Post not found.")

    const membership = await prisma.membership.findUnique({
        where: { profileId_orgId: { profileId: viewerId, orgId: post.orgId } },
        select: { status: true, role: true },
    })
    if (membership?.status !== "APPROVED") throw notFound("Post not found.")

    return post
}

/* ---------------------------------------------------------------------------
 * Reads
 * ------------------------------------------------------------------------- */

/* One page of the viewer's feed, newest first.
 *
 * The feed is the union of every organization the viewer has an APPROVED membership in —
 * which today is one parish, and is written as a set because it is about to be more than
 * one (a diocese contributing its parishes, and the planned follow feature contributing
 * people). A viewer with no approved memberships gets an empty page, not an error: they
 * are signed in and waiting on an admin, and the surface says so. */
export const listFeed = async (viewer, { limit, cursor }) => {
    const orgIds = await readableOrgIds(viewer.id)
    if (orgIds.length === 0) return { items: [], nextCursor: null }

    const rows = await prisma.post.findMany({
        where: { orgId: { in: orgIds }, deletedAt: null, ...keysetWhere(cursor, "desc") },
        orderBy: keysetOrder("desc"),
        take: limit + 1,
        include: postInclude(viewer.id),
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
    const post = await loadReadablePost(viewer.id, postId, {
        include: postInclude(viewer.id),
    })

    const likedBy = await likedByNames([post.id], viewer.id)

    return projectPost(post, {
        liked: post.likes.length > 0,
        likedBy: likedBy.get(post.id) ?? null,
    })
}

/* How many of the viewer's own comments ride at the top of a thread.
 *
 * Bounded rather than "all of them" because the pinned block is fetched whole, with no
 * cursor of its own — an unbounded version would load every comment a chatty member ever
 * left on a busy post before the first page could render. Anything past the cap is not
 * lost: it simply stays where it was written, in the chronological body below. */
const PINNED_OWN_COMMENTS = 20

/* One page of a post's comments: the viewer's own first, then the thread oldest-first.
 *
 * **The viewer's own comments are pinned to the top**, newest first, so the reply someone
 * just left is where they left it when they close the sheet and open it again — not buried
 * at the far end of a thread they'd have to page through to find. The client shows a new
 * comment at the top optimistically, and this is what makes the server agree on a reload
 * instead of contradicting it.
 *
 * The pinned set is resolved on *every* page, not just the first, because its ids are what
 * the chronological body excludes — a later page that forgot to exclude them would serve
 * the same comment twice, once pinned and once in place. Only the first page carries the
 * block itself.
 *
 * Oldest-first is why the body's direction is "asc" here and "desc" in the feed; the cursor
 * helpers take it explicitly because getting it wrong silently repeats the first page
 * rather than failing. The cursor still comes off the body's last row, so pinning changes
 * nothing about how the thread pages. */
export const listComments = async (viewer, postId, { limit, cursor }) => {
    /* The post was loaded to authorize the read; its `orgId` is then what decides which
     * commenters wear the admin check, so it is carried into the projection rather than
     * re-queried per comment. */
    const post = await loadReadablePost(viewer.id, postId)

    const own = await prisma.comment.findMany({
        where: { postId, authorId: viewer.id, deletedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PINNED_OWN_COMMENTS,
        include: commentInclude(viewer.id),
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
    })

    const project = (comment) =>
        projectComment(comment, { liked: comment.likes.length > 0, orgId: post.orgId })

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
    await requireMembership(viewer.id, orgId, { role: "ADMIN" })

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

    /* Freshly created: the author cannot have liked it, and nobody else has seen it. */
    return projectPost(post, { liked: false, likedBy: null })
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
    await loadReadablePost(viewer.id, postId)

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

    await loadReadablePost(viewer.id, comment.postId)

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
    const post = await loadReadablePost(viewer.id, postId)

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

    return projectComment(comment, { liked: false, orgId: post.orgId })
}
