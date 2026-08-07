import { useEffect, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import { useDelay } from "@/lib/hooks/useDebounce.hook"
import useAppStore from "./store"

export const useApp = () => {
    const [ready, loading, init] = useAppStore(useShallow(state => ([
        state.ready,
        state.loading.detail,
        state.init,
    ])))

    useEffect(() => {
        init()
    }, [init])

    const skeleton = useDelay(useMemo(() => !ready && loading, [ready, loading]))

    return useMemo(() => ({
        skeleton,
    }), [skeleton])
}
