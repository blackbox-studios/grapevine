import { useEffect, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import { VIEWER } from "@/lib/metadata"
import useCommentsStore from "./store"

/* The open post's comment thread. Mounting this hook (the drawer/dialog opens)
 * kicks off the first-page fetch; the thread is cleared on close (unmount), so every
 * open re-fetches and re-shows the skeleton. `loadingMore` powers the ripple on the
 * "load more" affordance. */
export const useComments = (postId) => {
    const [items, ready, hasMore, loadingMore, load, loadMore, toggleLike, add, reset] =
        useCommentsStore(useShallow(state => ([
            state.items,
            state.ready,
            state.hasMore,
            state.loading.list,
            state.load,
            state.loadMore,
            state.toggleLike,
            state.add,
            state.reset,
        ])))

    useEffect(() => {
        if (!postId) return
        load(postId)
        return () => reset()
    }, [postId, load, reset])

    /* Skeleton until the first page lands — painted on the first frame (the thread is
     * cleared on close, so `ready` is false when the surface reopens). */
    const skeleton = !ready

    return useMemo(() => ({
        comments: items,
        hasMore,
        skeleton,
        loadingMore,
        viewer: VIEWER,
        loadMore,
        toggleLike,
        add,
    }), [items, hasMore, skeleton, loadingMore, loadMore, toggleLike, add])
}
