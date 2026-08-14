import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS, ERROR_CODES } from '@/lib/constants'
import useFeedStore from '@/lib/store/feed/store'
import { haptic } from '@/lib/native'
import { toErrorList } from '@/lib/utils'

/* The one open post (`/p/:id`) — and the owner of every write to a post.
 *
 * Two responsibilities, and they belong together:
 *
 *  1. **Detail, fetched by id at runtime.** Not a lookup in the feed: with pagination the
 *     feed only holds the pages asked for, and a cold deep link has no feed behind it at
 *     all. Fetching by id is also what lets post ids be unknown at build time, which the
 *     static export requires (see native-architecture.md → Dynamic routes at scale).
 *  2. **Writes.** A like can be tapped from a feed card or from the open overlay, so the
 *     action can't live with either surface. It lives here, and every mutation lands on both
 *     copies of the post: this store's `current` and the feed's row (via `patchPost`).
 *
 * Transient by design: the hook resets it when the surface closes, so the next open starts
 * clean rather than flashing the previously-viewed post. That is also why it is left out of
 * `initAuthorizedStores` — there is no boot fetch to run, and global readiness must not wait
 * on a surface that may never open. */

const ERROR_INIT = {
    detail: false,
    like: false,
}

const LOADING_INIT = {
    detail: false,
}

const INIT = {
    /* Gates the surface's skeleton. True as soon as *something* is renderable — which the
     * feed's cached row satisfies, so an in-app open never shows a skeleton — and set on the
     * failure path too, or the skeleton spins forever instead of resolving to "Post not
     * found". */
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* `current` is the resource; `currentId` is what the app asked for, which is not the same
     * thing while a fetch is in flight. Keeping them apart is what lets a late response for
     * a post the reader has already left be discarded. */
    current: null,
    currentId: null,

    /* Post ids with a like write in flight. Not rendered — it exists so a detail response
     * issued *before* a tap can't land its pre-tap tally on top of the tap. See `load`. */
    liking: {},
}

const useStore = create(immer((set, get) => {
    /* Writes a partial to both copies of a post: the open one and the feed's row. */
    const patch = (postId, values) => {
        set(state => {
            if (state.current?.id === postId) Object.assign(state.current, values)
        })
        useFeedStore.getState().patchPost(postId, values)
    }

    /* Wherever the post is currently readable from — the open post if it's this one, else
     * the feed's row. A write needs its current values to be reversible. */
    const source = (postId) =>
        get().current?.id === postId
            ? get().current
            : useFeedStore.getState().cachedPost(postId)

    return {
        ...INIT,

        /* Opens a post. Two things happen, in this order, and the order is the whole feature:
         *
         *  1. The feed's already-loaded copy is promoted synchronously. That row carries the
         *     photo the reader just tapped — already fetched and decoded — so the surface
         *     paints complete on the first frame: no skeleton, no second image request, no
         *     flash. Reusing the feed's payload like this is the reason it's worth keeping.
         *  2. The detail fetch replaces it in the background, silently. There is already a
         *     full surface on screen, so covering it with a skeleton would be a regression;
         *     the fetch exists to pick up whatever the feed row didn't carry or that has
         *     since changed. Only the comment thread loads visibly (see useComments).
         *
         * A cold deep link takes the identical path and simply finds nothing in step 1, so
         * `ready` stays false and the surface shows its skeleton until the fetch lands. */
        load: async (postId) => {
            if (!postId) return

            const cached = useFeedStore.getState().cachedPost(postId)
            set(state => {
                state.currentId = postId
                state.current = cached
                state.ready = cached !== null
                state.error.detail = false
                state.loading.detail = true
            })

            try {
                const post = await api.get(API_ENDPOINTS.POST(postId))
                set(state => {
                    /* Another post may have been opened while this was in flight; a late
                     * response must never overwrite the one the reader is looking at. */
                    if (state.currentId !== postId) return
                    /* A like tapped while this was in flight is *newer* than this response
                     * (writes settle faster than reads), so keep the client's tally and take
                     * everything else. Otherwise the heart visibly reverts a beat after the
                     * reader filled it. */
                    state.current =
                        state.liking[postId] && state.current
                            ? { ...post, liked: state.current.liked, likes: state.current.likes }
                            : post
                    state.ready = true
                })
                /* Keep the feed row in step so tallies don't diverge behind the overlay. */
                if (get().currentId === postId) {
                    useFeedStore.getState().patchPost(postId, get().current)
                }
            } catch (error) {
                set(state => {
                    if (state.currentId !== postId) return
                    state.ready = true
                    /* Only surface the failure when there is nothing on screen to fall back
                     * to: with a cached copy the post is already readable, so a failed
                     * background refresh should stay quiet. And a 404 is already fully
                     * communicated by the surface's not-found state, so toasting it too
                     * would just be noise. */
                    if (!cached && error?.code !== ERROR_CODES.NOT_FOUND) {
                        state.error.detail = toErrorList(error, 'Could not load this post.')
                    }
                })
            } finally {
                set(state => {
                    if (state.currentId === postId) state.loading.detail = false
                })
            }
        },

        /* Optimistic like toggle: the heart flips on the current frame, the server's
         * authoritative `{ liked, likes }` reconciles it, and a failure restores exactly what
         * was there before rather than guessing the inverse. */
        toggleLike: async (postId) => {
            if (!postId) return

            const post = source(postId)
            if (!post) return

            const { liked: wasLiked, likes: wasLikes } = post
            const liked = !wasLiked

            if (liked) haptic()
            set(state => { state.liking[postId] = true })
            patch(postId, { liked, likes: wasLikes + (liked ? 1 : -1) })

            try {
                const result = await api.post(API_ENDPOINTS.POST_LIKES(postId))
                patch(postId, { liked: result.liked, likes: result.likes })
            } catch (error) {
                patch(postId, { liked: wasLiked, likes: wasLikes })
                set(state => {
                    state.error.like = toErrorList(error, 'Could not update your like.')
                })
            } finally {
                set(state => { delete state.liking[postId] })
            }
        },

        /* Nudges a post's comment tally — called cross-store by the `comments` store when the
         * viewer posts a comment (and again with -1 if that write fails), so the count the
         * feed renders stays consistent with the thread's length. */
        bumpCommentCount: (postId, delta = 1) => {
            const post = source(postId)
            if (!post) return
            patch(postId, { comments: post.comments + delta })
        },

        /* Clears the open post. Called from the hook's cleanup when the surface closes. */
        reset: () => set(() => ({ ...INIT })),
        clearErrors: () => set(state => { state.error = ERROR_INIT }),
    }
}))

export default useStore
