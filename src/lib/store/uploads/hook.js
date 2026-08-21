"use client"

import { useCallback, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { UPLOAD_PURPOSES } from "@/lib/constants"
import useUploadsStore from "./store"

/* Uploading files, for any surface that collects them.
 *
 * Bound to a purpose (and, where the purpose needs one, a group) at the call site, so the
 * caller passes files and nothing else:
 *
 *   const { upload, uploading } = useUpload(UPLOAD_PURPOSES.POST_MEDIA, orgId)
 *   const media = await upload(files)
 *
 * Always plural. One photo is a list of one, and a composer picking four should not be
 * uploading them one after another — `Promise.all` puts them on the wire together, which for
 * four photos over a phone connection is the difference between a wait and a delay.
 *
 * Failures are already parked in the store (and toasted by `useErrorListener`), so the
 * resolved list simply omits whatever didn't make it: the caller keeps the photos that
 * worked rather than losing four uploads to one bad file. */
export const useUpload = (purpose = UPLOAD_PURPOSES.POST_MEDIA, orgId = null) => {
    const [uploadOne, uploading, pending] = useUploadsStore(
        useShallow(state => ([state.upload, state.loading.upload, state.pending])),
    )

    const upload = useCallback(
        async (files) => {
            const list = Array.from(files ?? [])
            if (list.length === 0) return []

            const results = await Promise.all(
                list.map(file => uploadOne(file, { purpose, orgId })),
            )
            return results.filter(Boolean)
        },
        [uploadOne, purpose, orgId],
    )

    return useMemo(() => ({ upload, uploading, pending }), [upload, uploading, pending])
}
