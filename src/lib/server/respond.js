import "server-only"

/* Success responders. Every handler returns through one of these so status codes and body
 * shapes stay uniform — see `.claude/skills/develop/backend-architecture.md` §2. */

/* One resource, unwrapped: the body *is* the object. No envelope key, ever. */
export const sendResource = (resource) => Response.json(resource)

/* A created resource: 201 plus the `Location` of the thing that now exists. */
export const sendCreated = (resource, location) =>
    Response.json(resource, {
        status: 201,
        ...(location ? { headers: { Location: location } } : {}),
    })

/* A collection — **always** an object, never a bare array, even where pagination looks
 * unnecessary today. Adding a key to an object is non-breaking; turning an array into an
 * object is not.
 *
 * `nextCursor` is the sole end-of-collection signal: null means there is no next page.
 * It is opaque to the client, which must never parse it. */
export const sendCollection = (items, nextCursor = null) =>
    Response.json({ items, nextCursor })

export const sendNoContent = () => new Response(null, { status: 204 })
