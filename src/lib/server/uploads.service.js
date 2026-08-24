import "server-only"

import {
    DOCUMENT_MIME_TYPES,
    IMAGE_MIME_TYPES,
    MAX_DOCUMENT_BYTES,
    MAX_IMAGE_BYTES,
    MIME_EXTENSIONS,
    UPLOAD_PURPOSES,
} from "@/lib/constants"
import { requireMembership } from "@/lib/server/auth"
import { invalid } from "@/lib/server/errors"
import { signUpload } from "@/lib/server/storage"

/* Permission to upload one file.
 *
 * The whole point of this service is that **the client never names its own destination.**
 * It states a *purpose*, and this decides both who may ask and where the object lands — so
 * there is no parameter an attacker could bend into another group's folder or an existing
 * object's key. What comes back is a signed URL for one fresh path; the bytes then go
 * straight to Supabase (see `lib/server/storage.js` for why they do not come through here).
 *
 * The authorization is the same rule as the write the file is destined for, applied at the
 * moment the URL is minted rather than when the post is created. That ordering matters: a
 * member who is refused at publish time would already have uploaded, leaving an orphan they
 * were never entitled to write. */

/* One entry per purpose: who may ask, and the folder it writes into.
 *
 * `authorize` returns the id whose folder the object belongs in, so the two decisions that
 * always travel together — may you, and whose is it — cannot be made in two places and
 * disagree. A post photo is the group's; an avatar is the viewer's own, and takes no `orgId`
 * at all, which is why the viewer is passed rather than just an id. */
const PURPOSES = {
    [UPLOAD_PURPOSES.POST_MEDIA]: {
        prefix: "posts",
        /* A post carries photos *and* one attachment, and both are the same write behind the
         * same permission — so they share a purpose rather than splitting into two that would
         * differ only in this list. Which kind a given file is, `createPost` reads off the
         * media row's `kind`; this only decides what may be uploaded at all. */
        mimeTypes: [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES],
        authorize: (viewer, { orgId }) => {
            if (!orgId) throw invalid("A group is required.", { orgId: "Required" })
            requireMembership(viewer, orgId, { role: "ADMIN" })
            return orgId
        },
    },
    [UPLOAD_PURPOSES.AVATAR]: {
        prefix: "avatars",
        /* Images only, deliberately — this is the one purpose a signed-in member can reach
         * without administering anything, so it stays the narrower of the two. */
        mimeTypes: IMAGE_MIME_TYPES,
        /* Nothing beyond a session: a person may always replace their own picture, and
         * `requireViewer` has already run. */
        authorize: (viewer) => viewer.id,
    },
}

/* Where a purpose's objects land.
 *
 * Exported because the write a grant was *for* has to check that the URLs it was handed came
 * out of one — `createPost` pairs this with `isOwnedUrl`. The table above is what chose the
 * folder, so it is also the only thing that can say what the folder should have been;
 * restating the string at the call site is how the two come to disagree after a rename. */
export const uploadPrefix = (purpose) => PURPOSES[purpose]?.prefix ?? null

/* The file extension for a mime type.
 *
 * Derived from the type rather than taken from the client's filename, which is an
 * uploader-chosen string and therefore a path-traversal vector. It is only cosmetic — the
 * object is served with the content type Supabase records, not by its extension — but a URL
 * ending in `.webp` or `.pdf` is what makes a bucket browsable by a human.
 *
 * `MIME_EXTENSIONS` covers the types whose tail is not the answer (`image/jpeg` → `jpg`, and
 * every `application/vnd.openxmlformats-…` monster); everything else splits cleanly. */
const extensionFor = (mimeType) =>
    MIME_EXTENSIONS[mimeType] ?? mimeType.split("/").pop().toLowerCase()

/* The ceiling for a mime type. A photo and an attachment are the same write behind the same
 * permission but not the same size — nothing should be able to put a 25MB photo in the bucket
 * just because a 25MB PDF is legitimate. */
const limitFor = (mimeType) =>
    IMAGE_MIME_TYPES.includes(mimeType) ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES

export const createUpload = async (viewer, { purpose, orgId = null, mimeType, sizeBytes }) => {
    const spec = PURPOSES[purpose]
    if (!spec) throw invalid("Unknown upload purpose.", { purpose: "Unsupported" })

    const type = String(mimeType ?? "").toLowerCase()
    if (!spec.mimeTypes.includes(type)) {
        throw invalid("That file type isn't supported.", { mimeType: "Unsupported" })
    }

    /* **The size is declared, not measured, and the endpoint is honest about that.** The bytes
     * never come through here (see `lib/server/storage.js`), so this cannot weigh the file —
     * it can only refuse to hand out a grant for one that says it is too big. That is worth
     * doing: it puts the per-kind limit in the API's contract rather than only in the browser,
     * and it is what a second client — the native app, a script — meets.
     *
     * What actually stops a *lying* client is the bucket, and a bucket-wide limit cannot tell
     * a photo from a PDF: it is set to the larger of the two, so a crafted request could still
     * store an oversized image. Closing that would mean a second bucket per kind, which is the
     * change to make if it ever matters. */
    const size = Number(sizeBytes)
    const limit = limitFor(type)
    if (Number.isFinite(size) && size > limit) {
        throw invalid(
            `That file is too large — the limit is ${Math.round(limit / 1024 / 1024)}MB.`,
            { sizeBytes: "Too large" },
        )
    }

    const ownerId = spec.authorize(viewer, { orgId })

    return signUpload({ prefix: spec.prefix, ownerId, extension: extensionFor(type) })
}
