/* Cross-store orchestration. Extend when you add new stores. */

import { create } from 'zustand'

import useAppStore from '@/lib/store/app/store'
import useAuthStore from '@/lib/store/auth/store'
import useFeedStore from '@/lib/store/feed/store'
import usePostStore from '@/lib/store/post/store'
import useCommentsStore from '@/lib/store/comments/store'
import useMembersStore from '@/lib/store/members/store'
import useNotificationsStore from '@/lib/store/notifications/store'
import useOrgStore from '@/lib/store/org/store'
import useUploadsStore from '@/lib/store/uploads/store'

/* `uploads` holds no remote state — it is a write path with a loading flag — so it has
 * nothing to boot and nothing for readiness to wait on. It still resets and reports errors.
 *
 * `post`, `comments`, and `members` are lazy, transient stores — loaded when a post (or its comment
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
 * `org` holds no remote state at all and needs no boot fetch either.
 *
 * `notifications` **is** booted here, and it is the one collection store that is — because
 * it is the only one that is not scoped to the selected group, so it has a request it can
 * make the moment there is a viewer. What it fetches on boot is the unread tally alone,
 * which is chrome the bell needs whether or not anybody opens the panel; the list itself is
 * loaded by the panel's own hook. */
const useStore = create(() => ({
    initAuthorizedStores: () => Promise.all([
        useAppStore.getState().init(),
        useNotificationsStore.getState().init(),
    ]),
    reset: () => {
        useAppStore.getState().reset()
        useAuthStore.getState().reset()
        useOrgStore.getState().reset()
        useFeedStore.getState().reset()
        usePostStore.getState().reset()
        useCommentsStore.getState().reset()
        useMembersStore.getState().reset()
        useNotificationsStore.getState().reset()
        useUploadsStore.getState().reset()
    },
    clearErrors: () => {
        useAppStore.getState().clearErrors()
        useAuthStore.getState().clearErrors()
        useOrgStore.getState().clearErrors()
        useFeedStore.getState().clearErrors()
        usePostStore.getState().clearErrors()
        useCommentsStore.getState().clearErrors()
        useMembersStore.getState().clearErrors()
        useNotificationsStore.getState().clearErrors()
        useUploadsStore.getState().clearErrors()
    },
}))

export default useStore
