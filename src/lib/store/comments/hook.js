import { useEffect, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import { useViewerAuthor } from "@/lib/store/auth/hook"
import useCommentsStore from "./store"

/* The open post's comment thread. Mounting this hook (the drawer/dialog opens)
 * kicks off the first-page fetch; the thread is cleared on close (unmount), so every
 * open re-fetches and re-shows the skeleton. `loadingMore` powers the ripple on the
 * "load more" affordance. */
export const useComments = (postId) => {
    /* The signed-in viewer, in the author shape the composer's avatar row renders and the
     * optimistic row is stamped with. Comes off the session now rather than a seed
     * constant, so the row that appears is the one the server will confirm. */
    const viewer = useViewerAuthor()
    const [items, ready, hasMore, loadingMore, load, loadMore, toggleLike, add, reset] =
        useCommentsStore(useShallow(state => ([
            state.items,
            state.ready,
            state.hasMore,
            state.loading.more,
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
        viewer,
        loadMore,
        toggleLike,
        add,
    }), [items, hasMore, skeleton, loadingMore, viewer, loadMore, toggleLike, add])
}
