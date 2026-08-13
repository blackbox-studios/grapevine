import "server-only"

import { invalid } from "@/lib/server/errors"

/* Opaque pagination cursors. The client is contractually forbidden from parsing these, so
 * the encoding is free to change — which is the point: an offset today, a keyset
 * (`{ createdAt, id }`) once a real database is behind it, with no client change.
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

/* Slices one page out of an in-memory array and returns it with the cursor for the next.
 * `nextCursor` is null at the end of the collection — the only end signal the client gets.
 *
 * Replace this with a real `take`/`skip` (or keyset) query when Prisma is wired in; the
 * shape it returns is what the endpoints are written against, so nothing above changes. */
export const paginate = (all, { limit, cursor }) => {
    const offset = decodeCursor(cursor)?.offset ?? 0
    const items = all.slice(offset, offset + limit)
    const next = offset + items.length

    return {
        items,
        nextCursor: next < all.length ? encodeCursor({ offset: next }) : null,
    }
}
