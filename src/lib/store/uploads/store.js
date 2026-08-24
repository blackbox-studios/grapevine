import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS, UPLOAD_PURPOSES } from '@/lib/constants'
import { prepareFile } from '@/lib/upload'
import { supabase } from '@/lib/supabase'
import { toErrorList } from '@/lib/utils'

/* Getting a file from a person's device into storage — for anything that needs it.
 *
 * **A domain of its own rather than a helper inside the composer**, because the composer is
 * only the first caller: a profile picture, a group's avatar, and a document attachment are
 * all the same three steps against a different purpose. The purpose is the only thing that
 * varies, and it is a parameter.
 *
 * The three steps, and why the middle one exists:
 *
 *  1. **Prepare** (`lib/upload.js`) — a photo is scaled, re-encoded and stripped of EXIF; an
 *     attachment is passed through untouched. Local either way; nothing is sent.
 *  2. **Ask `/api/uploads` for permission**, which answers a signed upload URL for exactly
 *     one path it chose. This is where authorization happens: the client never names its own
 *     destination, so there is no parameter to bend into another group's folder.
 *  3. **Send the bytes straight to Supabase.** They do not pass through our API — see the
 *     header of `lib/server/storage.js`.
 *
 * Step 3 is the one place in the app where a store talks to something other than `lib/api.js`,
 * and it is not an exception to the layering rule: Supabase is not our API, and the auth
 * store already reaches for the same client for the same reason. The rule this store does
 * keep is the one that matters — **no component fetches**. Everything above it calls
 * `useUpload()`.
 *
 * **Nothing here holds a result.** An upload's product is a URL, and it belongs to whatever
 * write it was for — a post's media array, a profile's `avatarUrl`. Parking it here would
 * make two owners for one value. So the action *returns* the descriptor and the store keeps
 * only what is genuinely cross-cutting: whether an upload is in flight, and what went wrong. */

const ERROR_INIT = {
    upload: false,
}

const LOADING_INIT = {
    upload: false,
}

const INIT = {
    /* Ready from the start: this store loads nothing, so there is no boot fetch for a
     * skeleton to wait on. It is out of `initAuthorizedStores` for the same reason. */
    ready: true,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* How many uploads are in flight. A count and not a boolean, because a composer with
     * four photos runs four at once and any one of them finishing must not clear the
     * indicator for the other three. */
    pending: 0,
}

const useStore = create(immer((set) => ({
    ...INIT,

    /* Uploads one file and returns the descriptor a write needs:
     * `{ url, kind, mimeType, fileName, sizeBytes }`, plus `width`/`height` for a photo — the
     * exact shape `POST /api/posts` expects a media entry in. Returns null on failure, having
     * parked the error, so a caller branches on the value rather than catching.
     *
     * A photo and an attachment take the same path here; what differs between them is
     * entirely `prepareFile`'s business, and `kind` is what it hands back for the media row.
     *
     * `purpose` decides both the permission and the folder (see `uploads.service.js`);
     * `orgId` is required by POST_MEDIA and ignored by the rest. */
    upload: async (file, { purpose = UPLOAD_PURPOSES.POST_MEDIA, orgId = null } = {}) => {
        if (!file) return null

        set(state => {
            state.pending += 1
            state.loading.upload = true
            state.error.upload = false
        })

        try {
            const { blob, ...meta } = await prepareFile(file)

            const grant = await api.post(API_ENDPOINTS.UPLOADS, {
                purpose,
                orgId,
                mimeType: meta.mimeType,
                /* Declared so the endpoint can refuse an oversized grant rather than only the
                 * browser refusing to ask for one — `prepareFile` has already rejected
                 * anything over the limit, so this only ever reports a size that passed. */
                sizeBytes: meta.sizeBytes,
            })

            const { error } = await supabase()
                .storage.from(grant.bucket)
                .uploadToSignedUrl(grant.path, grant.token, blob, {
                    /* Without this Supabase serves the object as the generic octet-stream it
                     * defaults to — an <img> pointed at it renders nothing, and a browser
                     * asked to open a PDF downloads an unnamed blob instead. */
                    contentType: meta.mimeType,
                })

            /* A storage failure is a plain object, not a throw. Raised here so the one
             * `catch` below handles every way this action can fail. */
            if (error) throw new Error(error.message)

            return { url: grant.url, ...meta }
        } catch (error) {
            set(state => {
                /* `toErrorList` only trusts an `ApiError`'s message, which is right — a
                 * random throw's message is an internal string. Every throw this action
                 * raises itself, though, carries copy written to be read ("photo.jpg is too
                 * large to upload"), and naming the file is the whole value of it. So it is
                 * passed as the fallback: the server's sentence still wins when there is
                 * one, and ours is used when there isn't. */
                state.error.upload = toErrorList(
                    error,
                    error?.message || 'Could not upload that photo.',
                )
            })
            return null
        } finally {
            set(state => {
                state.pending = Math.max(0, state.pending - 1)
                state.loading.upload = state.pending > 0
            })
        }
    },

    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
