import "server-only"

import { randomUUID } from "node:crypto"

import { supabaseAdmin } from "@/lib/server/supabase"

/* Supabase Storage, as the one place that knows a bucket name or builds an object path.
 *
 * **The bytes never pass through this server.** The client asks `/api/uploads` for
 * permission, this mints a short-lived *signed upload URL*, and the browser PUTs the file
 * straight to Supabase. Proxying the upload instead would put every parish photo through the
 * Node process — memory, bandwidth, and a slow phone holding a server connection open for the
 * length of its upload — to enforce a rule that is already enforced here, before any URL
 * exists. The signature is the authorization: it names one path, and it expires.
 *
 * **The bucket is public-read, and the path is what protects it.** An object's key is a
 * random UUID under a folder that is itself an opaque id, so a URL can be neither guessed nor
 * enumerated (`list` is not granted to anon). That buys the two things a private bucket
 * cannot: `<img src>` needs no signing round trip on a feed page, and the URL is stable, so
 * the browser and the CDN cache the photo instead of re-fetching it on every refresh. The
 * trade is real and deliberate — a URL that escapes is readable by whoever holds it,
 * regardless of membership. If a parish ever needs photos inside the membership gate, the
 * change is here plus `projectMedia`: sign on read with `createSignedUrls`, and accept a
 * Supabase call per feed page and a cache that always misses.
 */

export const BUCKET = "media"

/* Where an object lives, by purpose.
 *
 * The prefix segregates the two kinds of file so a lifecycle rule or a bulk cleanup can
 * address one without the other, and the owning id is a folder so everything a group (or a
 * person) has uploaded is enumerable *server-side* by prefix. The filename itself is a fresh
 * UUID rather than anything derived from the original: a name chosen by the uploader is both
 * a collision and a path-traversal vector, and there is nothing in it worth keeping — the
 * display name of a document is a database column. */
const objectPath = (prefix, ownerId, extension) =>
    `${prefix}/${ownerId}/${randomUUID()}.${extension}`

/* The public URL an object will have once it is uploaded.
 *
 * Resolved from the path rather than read back from the upload response, because the client
 * needs it *before* the upload completes — it is what gets written to `PostMedia.url`, and
 * the caller should not have to make a second request to learn it. `getPublicUrl` is a pure
 * string build in supabase-js and makes no network call. */
export const publicUrl = (path) =>
    supabaseAdmin().storage.from(BUCKET).getPublicUrl(path).data.publicUrl

/* Mints a signed upload URL for one new object.
 *
 * Returns the path, the token the client presents with the bytes, and the URL the object
 * will be reachable at. Supabase fixes the token's life at two hours and exposes no way to
 * shorten it; that is acceptable because the token names exactly one path that does not
 * exist yet, and `upsert` is left off — so the worst a leaked one can do is write the single
 * object the person who requested it was already entitled to write, once.
 *
 * The path is a fresh UUID on every call, which is what makes that guarantee hold: without
 * `upsert`, an upload can only ever create. */
export const signUpload = async ({ prefix, ownerId, extension }) => {
    const path = objectPath(prefix, ownerId, extension)

    const { data, error } = await supabaseAdmin()
        .storage.from(BUCKET)
        .createSignedUploadUrl(path)

    if (error) throw error

    /* `bucket` rides along so the client never has to hold a copy of the name. It sends the
     * bytes with `storage.from(bucket).uploadToSignedUrl(path, token, file)`, and the only
     * place the bucket is written down stays this file. */
    return { bucket: BUCKET, path, token: data.token, url: publicUrl(path) }
}
