import { useEffect, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import { FEED } from "@/lib/metadata"
import useFeedStore from "./store"

export const useFeed = () => {
    const [posts, ready, init, refresh] = useFeedStore(useShallow(state => ([
        state.items,
        state.ready,
        state.init,
        state.refresh,
    ])))

    useEffect(() => {
        init()
    }, [init])

    /* Skeleton derives straight from readiness, so it paints on the first frame and
     * stays until the initial load lands. No debounce needed: the store floors every
     * first load at MOCK_LATENCY_MS (see feed/store.js), so it's always on long
     * enough to read — never a sub-perceptual flash. Refreshes keep `ready` true and
     * so never re-flash it. */
    const skeleton = !ready

    return useMemo(() => ({
        posts,
        skeleton,
        refresh,
    }), [posts, skeleton, refresh])
}

/* A single post for the detail page (`/p/:id`). Resolved synchronously — the
 * media is already cached in the feed, so there's no fetch and no delay: the photo
 * paints immediately and only the comment thread shows a skeleton (owned by
 * `useComments` inside the panel). Reads the loaded `items` first so comment-count
 * bumps stay reactive, then falls back to the seed for a cold deep link. Returns
 * `null` for an unknown id, which the page renders as not-found. */
export const usePost = (postId) => {
    const items = useFeedStore(state => state.items)

    return useMemo(() => ({
        post: items.find(p => p.id === postId) ?? FEED.find(p => p.id === postId) ?? null,
    }), [items, postId])
}
