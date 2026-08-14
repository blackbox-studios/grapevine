import { useEffect, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import useFeedStore from "./store"

/* The dashboard feed. One page at a time: `hasMore` comes from the server's cursor being
 * non-null, `loadMore` appends the next page, and `refresh` (pull-to-refresh) replaces the
 * first one.
 *
 * The open post is `usePost` in `lib/store/post/hook.js` — including its like action, which
 * the feed card calls. */
export const useFeed = () => {
    const [posts, ready, hasMore, loadingMore, init, refresh, loadMore] = useFeedStore(
        useShallow(state => ([
            state.items,
            state.ready,
            state.hasMore,
            state.loading.more,
            state.init,
            state.refresh,
            state.loadMore,
        ])),
    )

    useEffect(() => {
        init()
    }, [init])

    /* Skeleton derives straight from readiness, so it paints on the first frame and stays
     * until the initial load lands. No debounce needed: the mock service floors every read
     * at MOCK_LATENCY_MS server-side (see lib/server/posts.service.js), so it is always on
     * long enough to read. Refreshes keep `ready` true and so never re-flash it. */
    const skeleton = !ready

    return useMemo(() => ({
        posts,
        skeleton,
        hasMore,
        loadingMore,
        refresh,
        loadMore,
    }), [posts, skeleton, hasMore, loadingMore, refresh, loadMore])
}
