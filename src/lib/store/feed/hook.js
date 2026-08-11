import { useEffect, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import useFeedStore from "./store"

export const useFeed = () => {
    const [posts, ready, init] = useFeedStore(useShallow(state => ([
        state.items,
        state.ready,
        state.init,
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
    }), [posts, skeleton])
}
