/* Cross-store orchestration. Extend when you add new stores. */

import { create } from 'zustand'

import useAppStore from '@/lib/store/app/store'
import useAuthStore from '@/lib/store/auth/store'
import useFeedStore from '@/lib/store/feed/store'
import usePostStore from '@/lib/store/post/store'
import useCommentsStore from '@/lib/store/comments/store'
import useMembersStore from '@/lib/store/members/store'
import useOrgStore from '@/lib/store/org/store'

/* `post`, `comments`, and `members` are lazy, transient stores — loaded when a post (or its comment
 * thread) opens and cleared on close — so they are intentionally left out of
 * initAuthorizedStores / useReady: they have no boot fetch, and global readiness must not
 * wait on a surface that may never open. `members` is additionally admin-only, so booting
 * it eagerly would fire a 403 for every ordinary member on every sign-in. All three still
 * participate in reset/clearErrors and error aggregation.
 *
 * `feed` is out of it too, for a different reason: it is scoped to the selected group, so
 * it has no request to make until one is resolved. That resolution happens in
 * `useCurrentOrg`, and the feed's own hook drives the load from it. Booting it here would
 * mean firing a request with no group, or duplicating the selection logic to guess one.
 * `org` holds no remote state at all and needs no boot fetch either. */
const useStore = create(() => ({
    initAuthorizedStores: () => Promise.all([
        useAppStore.getState().init(),
    ]),
    reset: () => {
        useAppStore.getState().reset()
        useAuthStore.getState().reset()
        useOrgStore.getState().reset()
        useFeedStore.getState().reset()
        usePostStore.getState().reset()
        useCommentsStore.getState().reset()
        useMembersStore.getState().reset()
    },
    clearErrors: () => {
        useAppStore.getState().clearErrors()
        useAuthStore.getState().clearErrors()
        useOrgStore.getState().clearErrors()
        useFeedStore.getState().clearErrors()
        usePostStore.getState().clearErrors()
        useCommentsStore.getState().clearErrors()
        useMembersStore.getState().clearErrors()
    },
}))

export default useStore
