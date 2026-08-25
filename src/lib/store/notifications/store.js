import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS, PAGE_SIZE } from '@/lib/constants'
import { toErrorList } from '@/lib/utils'

/* What the bell knows: how many are unread, and — once somebody opens the panel — the list.
 *
 * **Two resources with very different lifetimes, and that is why there are two fetches.**
 * The tally is chrome: it is wanted on every boot, for every viewer, whether or not they
 * ever look. The list is a surface: it is wanted when the panel opens and not before. So
 * `init` asks only for the count, and `load` is what fetches rows — see the header of
 * `app/api/notifications/unread/route.api.js` for the server half of the same split.
 *
 * `ready` tracks the list, which is this store's primary resource. The count is secondary
 * and needs no readiness flag of its own: it starts at 0, which renders as no dot, and a
 * badge that has not loaded yet is indistinguishable from one with nothing to show. That is
 * the correct falsehood to tell for the half second before it answers.
 *
 * **Not scoped to the selected group.** Every other collection in the app narrows to the
 * switcher's choice; this one deliberately does not. A like on something you wrote in a
 * parish you are not currently reading still happened to you, so the store takes no `orgId`
 * and needs no reset-on-switch — which is also why, unlike `feed` and `members`, it can boot
 * from `initAuthorizedStores` rather than from its own hook.
 *
 * ── Push notifications (Firebase, not yet) ───────────────────────────────────
 *
 * There is no polling here, and none should be added. The panel is correct as of the last
 * `refresh()`, which is boot and each time it opens; a notification that lands while the app
 * is in the foreground is not seen until one of those happens. That gap is what push closes,
 * and closing it with a timer first would be paying for it twice.
 *
 * What the Capacitor listener will need is already here: `refresh()` is reachable from
 * outside React as `useNotificationsStore.getState().refresh()`, so a push handler — which
 * runs in a plugin callback, not in a component — can pull the authoritative state rather
 * than trying to splice a payload into the list. */

const ERROR_INIT = {
    list: false,
    read: false,
}

const LOADING_INIT = {
    list: false,
    more: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* Loaded pages, flattened. `cursor` is the server's opaque continuation token. */
    items: [],
    cursor: null,
    hasMore: true,

    /* What the bell's dot stands for. Counts every unread notification, not just the ones
     * this page holds — the panel can be showing fifteen rows while forty are unread. */
    unread: 0,
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Boot. The tally only — see the header. Called from `initAuthorizedStores`, so it runs
     * once per sign-in for every viewer, including the ones who never open the panel. */
    init: async () => {
        await get().refreshUnread()
    },

    /* Re-reads the tally without touching the list. The cheap half, and the one a push
     * handler or an app-resume listener should call. */
    refreshUnread: async () => {
        try {
            const { unread } = await api.get(API_ENDPOINTS.NOTIFICATIONS_UNREAD)
            set(state => { state.unread = unread })
        } catch {
            /* Silent. A badge that could not be fetched is a badge that shows nothing, and
             * interrupting a reader on boot to tell them a count is missing is worse than
             * the missing count. Every other read here does park its error. */
        }
    },

    /* Idempotent open. Called by the hook when the panel mounts; safe to call on every open,
     * because a list already loaded is left alone and only the tally is re-read. */
    load: async () => {
        if (get().ready) {
            await get().refreshUnread()
            return
        }
        await get().refresh()
    },

    /* (Re)loads the first page. Replaces rather than merges — the newest page *is* the
     * answer, and reconciling against what the reader was holding would only preserve rows
     * that have since been overtaken. The tally comes along because the two are read
     * together and a list that disagreed with its own badge is the bug worth avoiding. */
    refresh: async () => {
        set(state => { state.loading.list = true })
        try {
            const [{ items, nextCursor }, { unread }] = await Promise.all([
                api.get(API_ENDPOINTS.NOTIFICATIONS, {
                    params: { limit: PAGE_SIZE.NOTIFICATIONS },
                }),
                api.get(API_ENDPOINTS.NOTIFICATIONS_UNREAD),
            ])
            set(state => {
                state.items = items
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
                state.unread = unread
                state.ready = true
            })
        } catch (error) {
            set(state => {
                state.error.list = toErrorList(error, 'Could not load your notifications.')
                /* Readiness resolves on the failure path too, or the skeleton spins forever
                 * instead of settling on an empty panel. */
                state.ready = true
            })
        } finally {
            set(state => { state.loading.list = false })
        }
    },

    /* Appends the next page. `nextCursor === null` is the only end-of-collection signal. */
    loadMore: async () => {
        const { cursor, hasMore, loading } = get()
        if (!hasMore || !cursor || loading.more || loading.list) return

        set(state => { state.loading.more = true })
        try {
            const { items, nextCursor } = await api.get(API_ENDPOINTS.NOTIFICATIONS, {
                params: { limit: PAGE_SIZE.NOTIFICATIONS, cursor },
            })
            set(state => {
                /* A refresh can land mid-append; dropping ids already held keeps that from
                 * duplicating rows. */
                const seen = new Set(state.items.map(item => item.id))
                state.items.push(...items.filter(item => !seen.has(item.id)))
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
            })
        } catch (error) {
            set(state => {
                state.error.list = toErrorList(error, 'Could not load more notifications.')
            })
        } finally {
            set(state => { state.loading.more = false })
        }
    },

    /* Clears the badge. Optimistic, because opening the panel *is* the reading and a dot
     * that lingers for a round trip after the reader has plainly seen the list reads as
     * broken. The snapshot is the count, restored on failure rather than assumed to be zero.
     *
     * **The rows keep their `read: false` on purpose.** Only the tally moves here. The panel
     * tints what was unread when it opened, and that tint is the reader's answer to "which
     * of these are new" — clearing it in the same frame they opened it would take the
     * information away at exactly the moment it is wanted. The next `refresh` brings the rows
     * back marked read, which is the right time for the highlight to go.
     *
     * **Posts unconditionally, and must.** The obvious guard — skip when `unread` is already
     * 0 — trusts a cached count that nothing refreshes between boot and the panel opening.
     * There is no polling here by design, so a like that lands while the app is open leaves
     * the store holding 0 while the server holds 1: the guard would bail, the panel would be
     * read, and the bell would light up *immediately after* on the next tally. The same
     * happens whenever the boot `refreshUnread` failed, since it swallows its error. The
     * cost of being right is one POST per open with nothing to mark. */
    markRead: async () => {
        const wasUnread = get().unread

        set(state => { state.unread = 0 })

        try {
            const { unread } = await api.post(API_ENDPOINTS.NOTIFICATIONS_READ)
            set(state => { state.unread = unread })
        } catch (error) {
            set(state => {
                state.unread = wasUnread
                state.error.read = toErrorList(error, 'Could not mark your notifications read.')
            })
        }
    },

    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
