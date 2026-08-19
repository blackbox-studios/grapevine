import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { toast } from 'sonner'

import api from '@/lib/api'
import { API_ENDPOINTS, PAGE_SIZE } from '@/lib/constants'
import { mockId } from '@/lib/mock'
import useAuthStore, { viewerAuthor } from '@/lib/store/auth/store'
import usePostStore from '@/lib/store/post/store'
import { haptic } from '@/lib/native'
import { toErrorList } from '@/lib/utils'

const ERROR_INIT = {
    list: false,
    add: false,
    like: false,
    remove: false,
}

const LOADING_INIT = {
    list: false,
    more: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* The one open thread. Only one comments surface is open at a time, so this holds a
     * flat list rather than a per-post cache; the hook resets it on close, so every open
     * re-fetches. `post` is the id being viewed, and `cursor` its next-page token. */
    items: [],
    post: null,
    cursor: null,
    hasMore: false,
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Loads the first page of a post's comments. Called from the hook when the comments
     * surface opens. Unlike the post itself, this always loads visibly — there is no cached
     * copy of a thread to paint from, and a thread is the part of a post the reader expects
     * to be live. */
    load: async (postId) => {
        if (!postId) return
        /* Stamp the requested id synchronously so a response can be matched against the
         * thread the reader is *now* looking at — same guard the `post` store uses. Without
         * it, opening a post while a previous post's request is still in flight lets that
         * stale response land its comments on the open surface, which then flashes to the
         * correct thread a beat later. */
        set(state => {
            state.post = postId
            state.loading.list = true
        })
        try {
            const { items, nextCursor } = await api.get(
                API_ENDPOINTS.POST_COMMENTS(postId),
                { params: { limit: PAGE_SIZE.COMMENTS } },
            )
            set(state => {
                /* A late response for a thread the reader has already left is discarded. */
                if (state.post !== postId) return
                state.items = items
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
                state.ready = true
            })
        } catch (error) {
            set(state => {
                if (state.post !== postId) return
                state.error.list = toErrorList(error, 'Could not load comments. Please try again.')
                /* Resolve readiness even on failure, so the surface settles on its empty
                 * state instead of holding the skeleton indefinitely. */
                state.ready = true
            })
        } finally {
            set(state => {
                if (state.post === postId) state.loading.list = false
            })
        }
    },

    /* Appends the next page — the "load more" affordance at the foot of the thread. */
    loadMore: async () => {
        const { post, cursor, hasMore, loading } = get()
        if (!post || !hasMore || !cursor || loading.more || loading.list) return

        set(state => { state.loading.more = true })
        try {
            const { items, nextCursor } = await api.get(
                API_ENDPOINTS.POST_COMMENTS(post),
                { params: { limit: PAGE_SIZE.COMMENTS, cursor } },
            )
            set(state => {
                const seen = new Set(state.items.map(comment => comment.id))
                state.items.push(...items.filter(comment => !seen.has(comment.id)))
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
            })
        } catch (error) {
            set(state => {
                state.error.list = toErrorList(error, 'Could not load more comments.')
            })
        } finally {
            set(state => { state.loading.more = false })
        }
    },

    /* Optimistic like toggle on a single comment in the open thread — same shape as the
     * post's, reconciled against the server's authoritative tally. */
    toggleLike: async (commentId) => {
        const source = get().items.find(comment => comment.id === commentId)
        /* A comment that hasn't been created yet has no server id to like. */
        if (!source || source.pending) return

        const { liked: wasLiked, likes: wasLikes } = source
        const liked = !wasLiked

        if (liked) haptic()

        const write = (state, next) => {
            const comment = state.items.find(item => item.id === commentId)
            if (comment) Object.assign(comment, next)
        }

        set(state => { write(state, { liked, likes: wasLikes + (liked ? 1 : -1) }) })

        try {
            const result = await api.post(API_ENDPOINTS.COMMENT_LIKES(commentId))
            set(state => { write(state, { liked: result.liked, likes: result.likes }) })
        } catch (error) {
            set(state => {
                write(state, { liked: wasLiked, likes: wasLikes })
                state.error.like = toErrorList(error, 'Could not update your like.')
            })
        }
    },

    /* Posts a comment as the current viewer.
     *
     * The row appears immediately under a temporary id, stamped with the locally-known
     * viewer, then is swapped for the created resource the server returns — which owns the
     * real id, author, and timestamp. Until that lands the row is marked `pending`, so the
     * UI can show it as not-yet-committed and refuse to like something that has no server
     * id yet. A failure removes the row and undoes the tally bump.
     *
     * The temporary id carries forward as `localId` so the list's React key survives the
     * swap — otherwise the row replays its entrance on confirmation. It goes to the front
     * because `listComments` pins the viewer's own comments there too, so it will not move
     * when the thread reloads. */
    add: async (text) => {
        const postId = get().post
        const body = (text ?? '').trim()
        if (!postId || !body) return

        /* Stamp the row with the real signed-in viewer. The server assigns the
         * authoritative author anyway, but showing the right person for the half-second
         * before it replies is the whole point of an optimistic row. */
        const author = viewerAuthor(useAuthStore.getState().user)

        const tempId = mockId('pending')
        set(state => {
            state.items.unshift({
                id: tempId,
                localId: tempId,
                author,
                text: body,
                createdAt: new Date().toISOString(),
                likes: 0,
                liked: false,
                pending: true,
            })
        })
        /* The `post` store owns writes to a post and moves both copies of it (the open one
         * and the feed's row). The server increments the tally too, so this optimistic bump
         * matches what the next detail fetch will report rather than double-counting. */
        usePostStore.getState().bumpCommentCount(postId, 1)

        try {
            const comment = await api.post(API_ENDPOINTS.POST_COMMENTS(postId), { text: body })
            set(state => {
                const index = state.items.findIndex(item => item.id === tempId)
                if (index !== -1) state.items[index] = { ...comment, localId: tempId }
            })
        } catch (error) {
            set(state => {
                state.items = state.items.filter(item => item.id !== tempId)
                state.error.add = toErrorList(error, 'Could not post your comment.')
            })
            usePostStore.getState().bumpCommentCount(postId, -1)
        }
    },

    /* Removes a comment — the viewer's own, or anyone's if they administer the post's
     * group. The server decides that; `canDelete` on the row is what the UI offers the
     * affordance from, and a client that asked anyway gets a 403.
     *
     * Optimistic, unlike the roster's administrative writes: the reader has already
     * confirmed, and a row that lingers after they say "delete" reads as broken. The
     * snapshot is the whole row *and its index*, so a failure puts it back where it was
     * rather than at the top of the thread, which is where a re-fetch would place it.
     *
     * The success toast fires on the server's answer, not on the optimistic removal —
     * saying "deleted" and then restoring the row a beat later would be a lie. */
    remove: async (commentId) => {
        const postId = get().post
        const index = get().items.findIndex(item => item.id === commentId)
        if (index === -1) return

        const removed = get().items[index]
        /* Nothing to delete server-side yet, and no id to name it by. */
        if (removed.pending) return

        set(state => { state.items.splice(index, 1) })
        usePostStore.getState().bumpCommentCount(postId, -1)

        try {
            await api.delete(API_ENDPOINTS.COMMENT(commentId))
            toast('Comment deleted')
        } catch (error) {
            set(state => {
                state.items.splice(index, 0, removed)
                state.error.remove = toErrorList(error, 'Could not delete that comment.')
            })
            usePostStore.getState().bumpCommentCount(postId, 1)
        }
    },

    /* Clear the open thread so the next open re-fetches and re-shows the skeleton.
     * Called from the hook's cleanup when the surface closes. */
    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
