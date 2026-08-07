/* Cross-store orchestration. Extend when you add new stores. */

import { create } from 'zustand'

import useAppStore from '@/lib/store/app/store'
import useAuthStore from '@/lib/store/auth/store'

const useStore = create(() => ({
    initAuthorizedStores: () => Promise.all([
        useAppStore.getState().init(),
    ]),
    reset: () => {
        useAppStore.getState().reset()
        useAuthStore.getState().reset()
    },
    clearErrors: () => {
        useAppStore.getState().clearErrors()
        useAuthStore.getState().clearErrors()
    },
}))

export default useStore
