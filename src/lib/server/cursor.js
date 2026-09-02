import "server-only"

import { invalid } from "@/lib/server/errors"

/* Opaque pagination cursors, and the keyset helpers the services page with.
 *
 * The client is contractually forbidden from parsing a cursor, which is what made the
 * move from the old offset scheme to the keyset one below a server-only change: no client
 * edit, no version bump. Keep it that way.
 *
 * base64url, not plain base64, so a cursor is safe in a query string unescaped. */
export const encodeCursor = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url")

export const decodeCursor = (cursor) => {
    if (!cursor) return null
    try {
        return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    } catch {
        throw invalid("Invalid pagination cursor.", { cursor: "Malformed" })
    }
}

/* ---------------------------------------------------------------------------
 * Keyset pagination
 *
 * Why not OFFSET: it makes the database walk and discard every row it skips, so page 100
 * costs a hundred times page 1, and any insert between two requests shifts every
 * subsequent page — in a feed sorted newest-first, a post published mid-scroll makes the
 * reader see one row twice and miss another. A keyset asks "the rows after *this exact
 * row*", which is a constant-cost index range scan and is stable under concurrent writes.
 *
 * The key is the pair `(createdAt, id)`, never `createdAt` alone: two posts can share a
 * timestamp, and a non-unique key silently drops or repeats rows at a page boundary. `id`
 * is the tiebreaker that makes the ordering total.
 *
 * `tiebreaker` names the column playing that part, and defaults to `id` because every model
 * with a surrogate key uses it. It exists for `Follow`, which is keyed by the *pair*
 * `(followerId, followingId)` and has no `id` at all — so a page of followers breaks its ties
 * on `followerId`, which is unique within that page's `followingId`. All three helpers take
 * it and all three must be given the same one.
 * ------------------------------------------------------------------------- */

/* The `where` fragment that resumes after a cursor, or `{}` for the first page.
 *
 * Read it as the lexicographic comparison it is: strictly past the cursor's timestamp, or
 * on the same timestamp and strictly past its tiebreaker. Postgres can satisfy that from an
 * index on `(createdAt, <tiebreaker>)` in the matching sort order, which is why the models
 * carry exactly those indexes.
 *
 * `direction` must match the query's `orderBy` — "desc" for newest-first (the feed),
 * "asc" for oldest-first (a comment thread). Mismatch them and the second page silently
 * repeats the first. */
export const keysetWhere = (cursor, direction = "desc", tiebreaker = "id") => {
    const key = decodeCursor(cursor)
    if (!key) return {}

    const { createdAt, id } = key
    if (!createdAt || !id) throw invalid("Invalid pagination cursor.", { cursor: "Malformed" })

    const at = new Date(createdAt)
    if (Number.isNaN(at.getTime())) {
        throw invalid("Invalid pagination cursor.", { cursor: "Malformed" })
    }

    const past = direction === "asc" ? "gt" : "lt"

    return {
        OR: [
            { createdAt: { [past]: at } },
            { createdAt: at, [tiebreaker]: { [past]: id } },
        ],
    }
}

/* The `orderBy` that pairs with `keysetWhere`. Always both columns, always same direction. */
export const keysetOrder = (direction = "desc", tiebreaker = "id") => [
    { createdAt: direction },
    { [tiebreaker]: direction },
]

/* Turns an over-fetched row set into the wire's `{ items, nextCursor }`.
 *
 * Call the query with `take: limit + 1`. That one extra row is how the end of the
 * collection is detected without a `COUNT(*)`: if it came back there is another page, and
 * if it didn't there isn't. A count would make the database touch every matching row on
 * every request to produce a number the contract does not even carry.
 *
 * `map` projects a database row onto its wire shape. The cursor is built from the raw row —
 * which still has a `Date` and the tiebreaker column — not the projection, so a projection is
 * free to rename or drop either field. */
export const keysetPage = (rows, limit, map = (row) => row, tiebreaker = "id") => {
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]

    return {
        items: page.map(map),
        nextCursor:
            hasMore && last
                ? encodeCursor({
                      createdAt: last.createdAt.toISOString(),
                      id: last[tiebreaker],
                  })
                : null,
    }
}

/* ---------------------------------------------------------------------------
 * Keyset pagination over a rank
 *
 * The same three helpers keyed on `(score, id)` instead of `(createdAt, id)`, for the one
 * collection that is ordered by a rank rather than by time: a comment thread. See
 * `commentScore()` in src/lib/rank.js for what the number means.
 *
 * Separate rather than a `field` parameter on the trio above, because the guarantee is
 * genuinely weaker and that is worth having to opt into. A timestamp is immutable, so a
 * keyset over it is exact — every row is passed exactly once however long the reader takes.
 * A score moves when somebody likes the comment, so a row can cross the cursor between two
 * requests and be served twice or not at all. That is inherent to paging any ranked list
 * (Instagram and Reddit both do it), it is bounded by the number of likes landing mid-scroll
 * on one post's thread, and the client dedupes by id on append. It is not a reason to page
 * a ranked thread by time instead — that would put page two in a different order from page
 * one, which is the visible bug.
 * ------------------------------------------------------------------------- */

/* Always descending: a rank has one useful direction, and "worst comments first" is not a
 * feature anybody is asking for. */
export const scoreWhere = (cursor) => {
    const key = decodeCursor(cursor)
    if (!key) return {}

    const { score, id } = key
    if (typeof score !== "number" || !Number.isFinite(score) || !id) {
        throw invalid("Invalid pagination cursor.", { cursor: "Malformed" })
    }

    /* The equality arm compares a float for exact equality, which is safe here and only
     * here: the value came out of this table, went through `JSON.stringify` (which emits the
     * shortest string that round-trips a double), and is being compared against the same
     * stored double. It is never arithmetic on a score, only the identity of one. */
    return { OR: [{ score: { lt: score } }, { score, id: { lt: id } }] }
}

export const scoreOrder = () => [{ score: "desc" }, { id: "desc" }]

export const scorePage = (rows, limit, map = (row) => row) => {
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]

    return {
        items: page.map(map),
        nextCursor: hasMore && last ? encodeCursor({ score: last.score, id: last.id }) : null,
    }
}
