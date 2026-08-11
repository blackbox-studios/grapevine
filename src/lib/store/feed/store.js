import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { mockDelay } from '@/lib/mock'
import { MOCK_LATENCY_MS } from '@/lib/constants'
import { FEED } from '@/lib/metadata'

/* How many posts a single page pulls. `refresh` loads the first page; `loadMore`
 * appends the next one — the scaffolding for infinite scroll / a "load more"
 * button once a real paginated backend lands. */
const PAGE_SIZE = 5

const ERROR_INIT = {
    list: false,
}

const LOADING_INIT = {
    list: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    items: [],
    page: 0,
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

    refresh: async () => {
        set(state => { state.loading.list = true })
        try {
            /* Race the fetch against a floor so the skeleton is always visible for at
             * least MOCK_LATENCY_MS — whichever finishes last wins. Swap the
             * Promise.resolve for `api.get(...)` when a backend lands. */
            const [page] = await Promise.all([
                Promise.resolve(FEED.slice(0, PAGE_SIZE)),
                mockDelay(MOCK_LATENCY_MS),
            ])
            set(state => {
                state.items = page
                state.page = 1
                state.hasMore = FEED.length > page.length
                state.ready = true
            })
        } catch {
            set(state => { state.error.list = ['Could not load the feed. Please try again.'] })
        } finally {
            set(state => { state.loading.list = false })
        }
    },

    /* Pagination scaffold — appends the next slice of FEED to `items`. Wired for a
     * future infinite-scroll / "load more" affordance; swap the slice for a real
     * `?page=` fetch when a backend arrives. */
    loadMore: async () => {
        if (get().loading.list || get().hasMore === false) return
        set(state => { state.loading.list = true })
        try {
            await mockDelay()
            const next = get().page
            const slice = FEED.slice(next * PAGE_SIZE, (next + 1) * PAGE_SIZE)
            set(state => {
                state.items.push(...slice)
                state.page = next + 1
                state.hasMore = state.items.length < FEED.length
            })
        } catch {
            set(state => { state.error.list = ['Could not load more posts.'] })
        } finally {
            set(state => { state.loading.list = false })
        }
    },

    /* Nudge a post's comment tally — called cross-store by the comments store when
     * the viewer posts (or would remove) a comment. */
    bumpCommentCount: (postId, delta = 1) => set(state => {
        const post = state.items.find(p => p.id === postId)
        if (post) post.comments += delta
    }),

    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
