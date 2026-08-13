/* Cross-store orchestration. Extend when you add new stores. */

import { create } from 'zustand'

import useAppStore from '@/lib/store/app/store'
import useAuthStore from '@/lib/store/auth/store'
import useFeedStore from '@/lib/store/feed/store'
import usePostStore from '@/lib/store/post/store'
import useCommentsStore from '@/lib/store/comments/store'

/* `post` and `comments` are lazy, transient stores — loaded when a post (or its comment
 * thread) opens and cleared on close — so they are intentionally left out of
 * initAuthorizedStores / useReady: they have no boot fetch, and global readiness must not
 * wait on a surface that may never open. Both still participate in reset/clearErrors and
 * error aggregation. */
const useStore = create(() => ({
    initAuthorizedStores: () => Promise.all([
        useAppStore.getState().init(),
        useFeedStore.getState().init(),
    ]),
    reset: () => {
        useAppStore.getState().reset()
        useAuthStore.getState().reset()
        useFeedStore.getState().reset()
        usePostStore.getState().reset()
        useCommentsStore.getState().reset()
    },
    clearErrors: () => {
        useAppStore.getState().clearErrors()
        useAuthStore.getState().clearErrors()
        useFeedStore.getState().clearErrors()
        usePostStore.getState().clearErrors()
        useCommentsStore.getState().clearErrors()
    },
}))

export default useStore
