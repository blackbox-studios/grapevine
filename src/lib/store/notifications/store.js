import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS, PAGE_SIZE } from '@/lib/constants'
import { clearPushNotifications } from '@/lib/push'
import { toErrorList } from '@/lib/utils'

/* What the bell knows: how many are unread, and the list behind it.
 *
 * **The list is preloaded at boot, not on first open.** The panel is small, fixed-size and
 * read far more often than it changes, so fetching it when somebody taps the bell means
 * every first open of a session is a skeleton in front of a round trip to a pooler in
 * another region — for a surface whose whole job is to be glanced at. `init` therefore runs
 * the full `refresh`, and by the time the panel is opened the rows are already in the store
 * and paint on the first frame. The cost is one extra query per sign-in for viewers who
 * never open it, which is the right trade for a panel that is chrome rather than a
 * destination.
 *
 * The tally is still its own request, fetched in parallel with every read of the list — see
 * the header of `app/api/notifications/unread/route.api.js`. It cannot be derived from the
 * rows in hand: it counts every unread notification, and the panel can be showing fifteen
 * while forty are unread.
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
 * ── Push notifications (Firebase) ────────────────────────────────────────────
 *
 * Push is what closes the gap between reads: a notification arriving with the app open fires
 * `sync` from the plugin callback in `usePushListeners`, reaching this store from outside
 * React through `useNotificationsStore.getState()`. Coming back to the foreground fires it
 * too, since a push delivered while the app was backgrounded draws a banner and never reaches
 * a callback.
 *
 * **Everything push cannot reach polls instead** — a browser, and any device without a
 * registered token. `pollUnread` is that path; `useNotificationsWatch` owns the gate deciding
 * who takes it.
 *
 * **The push is never spliced into the list.** It carries a title and a `postId`, not a
 * notification row, and treating a payload as state would let the panel hold something the
 * server never confirmed — while a device that was asleep or denied permission would hold
 * nothing at all. The row is the notification; a push is one delivery of it, and the only
 * correct response to one is to re-read. See `lib/server/notifications.service.js`. */

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

    /* Boot. The list *and* the tally — see the header. Called from `initAuthorizedStores`, so
     * it runs once per sign-in for every viewer, including the ones who never open the panel;
     * that is what makes the first open paint rows instead of a skeleton. Nothing awaits this,
     * and no readiness gate hangs off it, so the extra query costs the boot nothing visible.
     *
     * `silent`, because nobody asked for this read — see `refresh`. */
    init: async () => {
        await get().refresh({ silent: true })
    },

    /* Idempotent open. Called by the hook when the panel mounts; safe to call on every open,
     * because a list already loaded is updated in place rather than thrown away and refetched.
     *
     * After the boot preload this is always the `sync` branch, and that is the point: the rows
     * are on screen from the first frame and the read behind them only ever adds to what is
     * already there. `refresh` is left for the case the preload failed — a viewer who signed in
     * while the network was down still gets a list by opening the panel. */
    load: async () => {
        if (get().ready) {
            await get().sync()
            return
        }
        await get().refresh()
    },

    /* (Re)loads the first page. Replaces rather than merges — the newest page *is* the
     * answer, and reconciling against what the reader was holding would only preserve rows
     * that have since been overtaken. The tally comes along because the two are read
     * together and a list that disagreed with its own badge is the bug worth avoiding.
     *
     * **`silent` is for the boot preload, and it does two things.** It parks no error, because
     * interrupting a reader arriving at the app to tell them a panel they have not asked for
     * could not be fetched is worse than the missing panel. And it leaves `ready` false, so a
     * failed preload is not sticky: the next open takes this branch again, loud this time. */
    refresh: async ({ silent = false } = {}) => {
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
                if (silent) return

                state.error.list = toErrorList(error, 'Could not load your notifications.')
                /* Readiness resolves on the failure path too, or the skeleton spins forever
                 * instead of settling on an empty panel. */
                state.ready = true
            })
        } finally {
            set(state => { state.loading.list = false })
        }
    },

    /* Brings the head of the list up to date without disturbing what is already held. This is
     * the one a push handler, an app-resume listener, or an open of the panel should call.
     *
     * **Why not just `refresh`.** Replacing the list would collapse it back to one page, so a
     * push landing while somebody is three "Show more"s deep would yank the rows they are
     * reading out from under them — and it would bring every held row back marked `read`,
     * taking away the tint that answers "which of these are new" at the exact moment they are
     * looking at it. Merging keeps both: new rows arrive at the top, held rows are left as the
     * reader found them.
     *
     * The first page is newest-first, so the fresh rows go on in the order the server sent
     * them and the cursor is untouched — everything below the join is still reachable by the
     * same continuation token.
     *
     * **Unless nothing in the page was already held**, which means more arrived than a page
     * holds and merging would leave a hole in the middle of the list. Nothing can page that gap
     * closed cheaply, so it falls back to replacing: the deep scroll is lost, but only when the
     * alternative is a list that lies about what is adjacent to what.
     *
     * Silent on failure — no caller here was asked for by the reader, and a toast about a
     * background read is noise about a list that is seconds stale.
     *
     * **A no-op before the first load.** This updates a list; it does not start one. Every
     * caller fires on an event that can beat the boot preload — a cold launch replays its
     * banner tap before the session resolves — and that preload fetches the first page anyway.
     * Starting from nothing is `load`'s decision to make. */
    sync: async () => {
        if (!get().ready) return

        try {
            const [{ items, nextCursor }, { unread }] = await Promise.all([
                api.get(API_ENDPOINTS.NOTIFICATIONS, {
                    params: { limit: PAGE_SIZE.NOTIFICATIONS },
                }),
                api.get(API_ENDPOINTS.NOTIFICATIONS_UNREAD),
            ])
            set(state => {
                const seen = new Set(state.items.map(item => item.id))
                const fresh = items.filter(item => !seen.has(item.id))

                if (fresh.length === items.length) {
                    state.items = items
                    state.cursor = nextCursor
                    state.hasMore = nextCursor !== null
                } else if (fresh.length > 0) {
                    state.items.unshift(...fresh)
                }
                /* The common case is neither branch — nothing new since the last read — and
                 * leaving `items` untouched there is what keeps a sync behind an open panel
                 * from re-rendering every row it is already showing. */
                state.unread = unread
            })
        } catch {
            /* Silent — see above. */
        }
    },

    /* The cheap check behind the dot: read the tally, and fetch the list only if it moved. That
     * split is what makes polling affordable — an idle client pays the tally every tick and the
     * list only when something happened.
     *
     * **The tally is applied before the list is fetched.** The dot lights on the cheap request
     * and the rows land behind it, so the panel is already correct by the time it is opened.
     *
     * Compares rather than tests for growth, so a notification read on another device — or a
     * like taken back, which deletes the row — settles here too.
     *
     * One benign race: `markRead` clears the tally optimistically, so a poll already in flight
     * can answer with the pre-read count and re-light the dot for one request's worth of time.
     * The next tick settles it, and the alternative is a lock between two things that are both
     * allowed to be briefly wrong. */
    pollUnread: async () => {
        try {
            const { unread } = await api.get(API_ENDPOINTS.NOTIFICATIONS_UNREAD)
            if (unread === get().unread) return

            set(state => { state.unread = unread })
            await get().sync()
        } catch {
            /* Silent, like `sync` — nobody asked for this one either. */
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
     * information away at exactly the moment it is wanted. `sync` leaves held rows alone for
     * the same reason, so the tint survives every update the open panel takes; the next boot
     * brings the rows back marked read, which is the right time for the highlight to go.
     *
     * **Posts unconditionally, and must.** The obvious guard — skip when `unread` is already
     * 0 — trusts a cached count. It is read on boot and on every push, but a like can land in
     * between on a device with push denied or unsupported, leaving the store holding 0 while
     * the server holds 1: the guard would bail, the panel would be read, and the bell would
     * light up *immediately after* on the next tally. The same happens whenever the boot read
     * failed, since it parks its error rather than retrying. The cost of being right is one
     * POST per open with nothing to mark. */
    markRead: async () => {
        const wasUnread = get().unread

        set(state => { state.unread = 0 })

        /* The banners the OS is still holding go with the badge. Having read the list in-app
         * and then finding a stack of notifications outside it is the app saying two
         * different things about the same events. Fire-and-forget and native-only; a no-op
         * everywhere else. */
        clearPushNotifications()

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
