import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS, PAGE_SIZE } from '@/lib/constants'
import { toErrorList } from '@/lib/utils'

/* The dashboard feed: one paginated list of posts, and nothing else.
 *
 * The open post lives in the `post` store, not here. The split matters because the two have
 * different lifetimes and different owners — the feed is a long-lived list the reader scrolls
 * and refreshes, while the open post is transient and addressed by id (including on a cold
 * deep link, where there is no feed at all). What this store keeps of a post is a
 * *projection*: the row it paged in. `cachedPost` / `patchPost` are how the `post` store
 * reads and writes that projection. */

const ERROR_INIT = {
    list: false,
}

const LOADING_INIT = {
    list: false,
    more: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* The loaded pages of the feed, flattened. `cursor` is the opaque continuation token
     * the server handed back for the next page; treat it as a string and never parse it. */
    items: [],
    cursor: null,
    hasMore: true,
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Idempotent boot. Called from the hook on mount; safe to call repeatedly. */
    init: async () => {
        if (get().ready === false && get().loading.list === false) {
            await get().refresh()
        }
    },

    /* (Re)loads the first page. Also what pull-to-refresh calls, which is why it replaces
     * `items` outright rather than merging: a refresh should show the newest page, not
     * reconcile against what the reader was already holding. */
    refresh: async () => {
        set(state => { state.loading.list = true })
        try {
            const { items, nextCursor } = await api.get(API_ENDPOINTS.FEED, {
                params: { limit: PAGE_SIZE.FEED },
            })
            set(state => {
                state.items = items
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
                state.ready = true
            })
        } catch (error) {
            set(state => {
                state.error.list = toErrorList(error, 'Could not load the feed. Please try again.')
            })
        } finally {
            set(state => { state.loading.list = false })
        }
    },

    /* Appends the next page. `nextCursor === null` is the only end-of-collection signal
     * the server gives, so `hasMore` is derived from it rather than from a total count. */
    loadMore: async () => {
        const { cursor, hasMore, loading } = get()
        if (!hasMore || !cursor || loading.more || loading.list) return

        set(state => { state.loading.more = true })
        try {
            const { items, nextCursor } = await api.get(API_ENDPOINTS.FEED, {
                params: { limit: PAGE_SIZE.FEED, cursor },
            })
            set(state => {
                /* A refresh can land mid-append and reset the list. Dropping ids we
                 * already hold keeps that from duplicating rows. */
                const seen = new Set(state.items.map(post => post.id))
                state.items.push(...items.filter(post => !seen.has(post.id)))
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
            })
        } catch (error) {
            set(state => {
                state.error.list = toErrorList(error, 'Could not load more posts.')
            })
        } finally {
            set(state => { state.loading.more = false })
        }
    },

    /* The loaded row for a post, or null if this page of the feed doesn't hold it.
     *
     * Read by the `post` store when a post opens: that row carries the photo the reader just
     * tapped, already fetched and decoded by the browser, so promoting it lets the post
     * surface paint whole on the first frame. It is a fast path and never a precondition —
     * a cold deep link gets null here and loads from the endpoint. */
    cachedPost: (postId) => get().items.find(post => post.id === postId) ?? null,

    /* Applies a partial update to a loaded row, if this page of the feed holds it.
     *
     * Every write to a post goes through the `post` store, which calls this so the feed's
     * copy moves with it. Without that the same post visibly disagrees with itself: the
     * overlay sits on the live feed, so a heart filled in the overlay would empty again the
     * moment it was dismissed. */
    patchPost: (postId, patch) => set(state => {
        const row = state.items.find(post => post.id === postId)
        if (row) Object.assign(row, patch)
    }),

    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
