import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { mockDelay } from '@/lib/mock'

const ERROR_INIT = {
    detail: false,
}

const LOADING_INIT = {
    detail: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,
}

const useStore = create(immer((set, get) => ({
    ...INIT,
    init: async () => {
        if (get().ready === false && get().loading.detail === false) {
            await get().refresh()
        }
    },
    refresh: async () => {
        set(state => { state.loading.detail = true })
        try {
            await mockDelay()
            set(state => { state.ready = true })
        } finally {
            set(state => { state.loading.detail = false })
        }
    },
    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
