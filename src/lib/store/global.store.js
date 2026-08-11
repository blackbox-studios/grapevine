/* Cross-store orchestration. Extend when you add new stores. */

import { create } from 'zustand'

import useAppStore from '@/lib/store/app/store'
import useAuthStore from '@/lib/store/auth/store'
import useFeedStore from '@/lib/store/feed/store'
import useCommentsStore from '@/lib/store/comments/store'

/* `comments` is a lazy, per-post transient store (loaded when a post's comments
 * open, reset on close), so it is intentionally left out of initAuthorizedStores /
 * useReady — global readiness must not wait on a surface that may never open. It
 * still participates in reset/clearErrors and error aggregation. */
const useStore = create(() => ({
    initAuthorizedStores: () => Promise.all([
        useAppStore.getState().init(),
        useFeedStore.getState().init(),
    ]),
    reset: () => {
        useAppStore.getState().reset()
        useAuthStore.getState().reset()
        useFeedStore.getState().reset()
        useCommentsStore.getState().reset()
    },
    clearErrors: () => {
        useAppStore.getState().clearErrors()
        useAuthStore.getState().clearErrors()
        useFeedStore.getState().clearErrors()
        useCommentsStore.getState().clearErrors()
    },
}))

export default useStore
