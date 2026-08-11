import { useEffect, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import useAppStore from "./store"

export const useApp = () => {
    const [ready, init] = useAppStore(useShallow(state => ([
        state.ready,
        state.init,
    ])))

    useEffect(() => {
        init()
    }, [init])

    /* Skeleton paints on the first frame and clears once ready. The store floors the
     * load at MOCK_LATENCY_MS, so no debounce is needed to avoid a flash. */
    const skeleton = !ready

    return useMemo(() => ({
        skeleton,
    }), [skeleton])
}
