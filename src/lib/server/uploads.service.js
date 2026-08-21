import "server-only"

import { IMAGE_MIME_TYPES, UPLOAD_PURPOSES } from "@/lib/constants"
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
        mimeTypes: IMAGE_MIME_TYPES,
        authorize: (viewer, { orgId }) => {
            if (!orgId) throw invalid("A group is required.", { orgId: "Required" })
            requireMembership(viewer, orgId, { role: "ADMIN" })
            return orgId
        },
    },
    [UPLOAD_PURPOSES.AVATAR]: {
        prefix: "avatars",
        mimeTypes: IMAGE_MIME_TYPES,
        /* Nothing beyond a session: a person may always replace their own picture, and
         * `requireViewer` has already run. */
        authorize: (viewer) => viewer.id,
    },
}

/* The file extension for a mime type.
 *
 * Derived from the type rather than taken from the client's filename, which is an
 * uploader-chosen string and therefore a path-traversal vector. It is only cosmetic — the
 * object is served with the content type Supabase records, not by its extension — but a URL
 * ending in `.webp` is what makes a bucket browsable by a human, and `image/jpeg` → `jpg`
 * rather than `jpeg` because that is what the rest of the world writes. */
const extensionFor = (mimeType) => {
    if (mimeType === "image/jpeg") return "jpg"
    return mimeType.split("/").pop().toLowerCase()
}

export const createUpload = async (viewer, { purpose, orgId = null, mimeType }) => {
    const spec = PURPOSES[purpose]
    if (!spec) throw invalid("Unknown upload purpose.", { purpose: "Unsupported" })

    const type = String(mimeType ?? "").toLowerCase()
    if (!spec.mimeTypes.includes(type)) {
        throw invalid("That file type isn't supported.", { mimeType: "Unsupported" })
    }

    const ownerId = spec.authorize(viewer, { orgId })

    return signUpload({ prefix: spec.prefix, ownerId, extension: extensionFor(type) })
}
