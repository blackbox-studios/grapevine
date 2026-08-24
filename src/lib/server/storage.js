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

/* Whether a URL is one this server minted, under a given owner's folder.
 *
 * A write is handed `url` strings by the client and would otherwise take them on trust — so a
 * crafted request could store anything as a post's photo: an off-site image the feed would
 * then render as parish content, or another group's object, whose path is unguessable and
 * would not be reachable any other way. A grant is the only thing that produces a legitimate
 * URL, and `objectPath` always puts it under `<prefix>/<ownerId>/`, so checking that prefix
 * checks both that `/api/uploads` issued it *and* that it was issued for this owner — which
 * is to say, that `createUpload`'s authorization already ran for this group.
 *
 * Built by calling `publicUrl` rather than matched against a pattern: the bucket name and the
 * project URL stay written down once, and a regex here could not drift out of step with them.
 *
 * **The folder prefix is not checked alone — what follows it must be one object name.** A
 * bare `startsWith` can be walked back out of the folder it just matched: append
 * `../../avatars/other.jpg` and the string still begins with the right prefix, while the
 * thing actually fetched is whatever the `..` resolve to. Normalizing through `URL` handles
 * the plain and percent-encoded dot forms, but not `..%2f` — WHATWG deliberately keeps an
 * encoded slash inside its segment, and whether the storage server agrees is its business,
 * not something to depend on.
 *
 * So the tail is matched positively instead of scanned for anything bad: `objectPath` mints
 * exactly `<uuid>.<extension>`, one segment, and only that is accepted. Nothing that traverses
 * can be spelled in a single UUID-shaped segment, in any encoding, whatever normalization the
 * far end applies — and a query string is refused too, since a grant never returns one.
 *
 * That does tie this to `objectPath`'s naming, which is why the two sit together: change the
 * shape of a key there and this must change with it, or every new upload stops validating.
 *
 * **It does not prove the bytes arrived.** They never come through this server, so nothing
 * here can know whether the upload the grant was for succeeded, was abandoned, or is still in
 * flight — a post can still be created against a path that holds no object, and it renders as
 * a broken image. That is the client's to avoid by uploading first, and it is a display
 * problem rather than a security one. What this closes is the two cases the client cannot be
 * trusted with: an arbitrary URL, and another group's. */
const OBJECT_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i

export const isOwnedUrl = (url, { prefix, ownerId }) => {
    if (typeof url !== "string") return false

    let href
    try {
        href = new URL(url).href
    } catch {
        /* Not a URL at all — a relative path, a `data:` blob, empty. Nothing minted here is
         * ever unparseable, so this is only reachable with a hand-made request. */
        return false
    }

    const folder = publicUrl(`${prefix}/${ownerId}/`)
    return href.startsWith(folder) && OBJECT_NAME.test(href.slice(folder.length))
}

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
