import { useEffect, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import { useDelay } from "@/lib/hooks/useDebounce.hook"
import useFeedStore from "./store"

export const useFeed = () => {
    const [posts, ready, loading, init] = useFeedStore(useShallow(state => ([
        state.items,
        state.ready,
        state.loading.list,
        state.init,
    ])))

    useEffect(() => {
        init()
    }, [init])

    /* Skeletons only on the initial load AND only if the load takes >150ms. */
    const skeleton = useDelay(useMemo(() => !ready && loading, [ready, loading]))

    return useMemo(() => ({
        posts,
        skeleton,
    }), [posts, skeleton])
}
