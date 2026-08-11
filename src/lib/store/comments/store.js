import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { mockDelay, mockId } from '@/lib/mock'
import { MOCK_LATENCY_MS } from '@/lib/constants'
import { COMMENTS, VIEWER } from '@/lib/metadata'
import useFeedStore from '@/lib/store/feed/store'

/* How many comments a single page pulls. `load` fetches the first page; `loadMore`
 * appends the next. */
const PAGE_SIZE = 8

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

    /* The one open thread. Only one comments surface is open at a time, so this
     * holds a flat list rather than a per-post cache; the hook resets it on close,
     * so every open re-fetches. `post` is the id being viewed (drives pagination). */
    items: [],
    post: null,
    page: 0,
    hasMore: false,
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Load the first page of a post's comments. Called from the hook when the
     * comments surface opens — mirroring GET /posts/:id/comments?page=1. */
    load: async (postId) => {
        if (!postId) return
        set(state => { state.loading.list = true })
        try {
            /* Race the fetch against a floor so the skeleton is always on screen for
             * at least MOCK_LATENCY_MS — whichever finishes last wins. Swap the
             * Promise.resolve for `api.get(...)` when a backend lands. */
            const [all] = await Promise.all([
                Promise.resolve(COMMENTS[postId] ?? []),
                mockDelay(MOCK_LATENCY_MS),
            ])
            const page = all.slice(0, PAGE_SIZE)
            set(state => {
                state.items = page
                state.post = postId
                state.page = 1
                state.hasMore = all.length > page.length
                state.ready = true
            })
        } catch {
            set(state => { state.error.list = ['Could not load comments. Please try again.'] })
        } finally {
            set(state => { state.loading.list = false })
        }
    },

    /* Append the next page of comments — the "load more" affordance. */
    loadMore: async () => {
        const { post, hasMore, page, loading } = get()
        if (!post || hasMore === false || loading.list) return
        set(state => { state.loading.list = true })
        try {
            await mockDelay()
            const all = COMMENTS[post] ?? []
            const slice = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
            set(state => {
                state.items.push(...slice)
                state.page += 1
                state.hasMore = state.items.length < all.length
            })
        } catch {
            set(state => { state.error.list = ['Could not load more comments.'] })
        } finally {
            set(state => { state.loading.list = false })
        }
    },

    /* Optimistic like toggle for a single comment in the open thread. */
    toggleLike: (commentId) => set(state => {
        const comment = state.items.find(c => c.id === commentId)
        if (!comment) return
        comment.liked = !comment.liked
        comment.likes += comment.liked ? 1 : -1
    }),

    /* Post a new comment as the current viewer — prepended to the thread and
     * reflected in the post's comment tally on the feed (cross-store). */
    add: (text) => {
        const postId = get().post
        const body = (text ?? '').trim()
        if (!postId || !body) return
        const comment = {
            id: mockId('cmt'),
            author: VIEWER,
            text: body,
            created_at: new Date().toISOString(),
            likes: 0,
            liked: false,
        }
        set(state => { state.items.unshift(comment) })
        useFeedStore.getState().bumpCommentCount(postId)
    },

    /* Clear the open thread so the next open re-fetches and re-shows the skeleton.
     * Called from the hook's cleanup when the surface closes. */
    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
