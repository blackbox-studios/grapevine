/* Cross-store orchestration. Extend when you add new stores. */

import { create } from 'zustand'

import useAppStore from '@/lib/store/app/store'
import useAuthStore from '@/lib/store/auth/store'
import useFeedStore from '@/lib/store/feed/store'
import useFollowsStore from '@/lib/store/follows/store'
import usePostStore from '@/lib/store/post/store'
import useProfileStore from '@/lib/store/profile/store'
import useCommentsStore from '@/lib/store/comments/store'
import useMembersStore from '@/lib/store/members/store'
import useNotificationsStore from '@/lib/store/notifications/store'
import useOrgStore from '@/lib/store/org/store'
import usePushStore from '@/lib/store/push/store'
import useUploadsStore from '@/lib/store/uploads/store'

/* `uploads` holds no remote state — it is a write path with a loading flag — so it has
 * nothing to boot and nothing for readiness to wait on. It still resets and reports errors.
 *
 * `post`, `comments`, `profile`, `follows` and `members` are lazy, transient stores — loaded
 * when a post, its comment thread, a profile or one of that profile's follow lists opens, and
 * cleared on close — so they are intentionally left out of initAuthorizedStores / useReady:
 * they have no boot fetch, and global readiness must not wait on a surface that may never
 * open. `members` is additionally admin-only, so booting it eagerly would fire a 403 for every
 * ordinary member on every sign-in. All five still participate in reset/clearErrors and error
 * aggregation.
 *
 * `feed` is out of it too, for a different reason: it is scoped to the selected group, so
 * it has no request to make until one is resolved. That resolution happens in
 * `useCurrentOrg`, and the feed's own hook drives the load from it. Booting it here would
 * mean firing a request with no group, or duplicating the selection logic to guess one.
 * `org` holds no remote state at all and needs no boot fetch either.
 *
 * `notifications` **is** booted here, and it is the one collection store that is — because
 * it is the only one that is not scoped to the selected group, so it has a request it can
 * make the moment there is a viewer. It fetches the tally *and* the first page of the list,
 * so the panel is populated before anybody opens it; see that store's header for why a
 * surface this small is worth preloading when the feed is not.
 *
 * `push` is booted here too, for the same reason and with one caveat worth stating: its
 * `init` **never prompts**. It registers this device's FCM token only where permission has
 * already been granted, so a boot path can hold it safely. The ask itself is `enable()`,
 * which belongs to a deliberate tap — iOS spends its system prompt once per install, and
 * firing it from a splash screen is how an app becomes permanently unreachable. Off-device
 * the whole thing resolves to nothing. */
const useStore = create(() => ({
    initAuthorizedStores: () => Promise.all([
        useAppStore.getState().init(),
        useNotificationsStore.getState().init(),
        usePushStore.getState().init(),
    ]),
    reset: () => {
        useAppStore.getState().reset()
        useAuthStore.getState().reset()
        useOrgStore.getState().reset()
        useFeedStore.getState().reset()
        usePostStore.getState().reset()
        useCommentsStore.getState().reset()
        useProfileStore.getState().reset()
        useFollowsStore.getState().reset()
        useMembersStore.getState().reset()
        useNotificationsStore.getState().reset()
        usePushStore.getState().reset()
        useUploadsStore.getState().reset()
    },
    clearErrors: () => {
        useAppStore.getState().clearErrors()
        useAuthStore.getState().clearErrors()
        useOrgStore.getState().clearErrors()
        useFeedStore.getState().clearErrors()
        usePostStore.getState().clearErrors()
        useCommentsStore.getState().clearErrors()
        useProfileStore.getState().clearErrors()
        useFollowsStore.getState().clearErrors()
        useMembersStore.getState().clearErrors()
        useNotificationsStore.getState().clearErrors()
        usePushStore.getState().clearErrors()
        useUploadsStore.getState().clearErrors()
    },
}))

export default useStore
