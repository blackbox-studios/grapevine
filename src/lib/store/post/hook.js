import { useCallback, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import useIsomorphicLayoutEffect from "@/lib/hooks/useIsomorphicLayoutEffect.hook"
import usePostStore from "./store"

/* The open post (`/p/:id`), fetched when it opens rather than resolved from a build-time
 * list. Mounting this hook is what triggers the load; unmounting clears the store so the
 * next open starts clean.
 *
 * `skeleton` is false on the very first frame for an in-app open, because the store seeds
 * `current` from the feed's cached copy of the post — the photo is already decoded, so the
 * surface paints whole and the background detail fetch is invisible. It is only true when
 * there was no cached copy to seed from, i.e. a cold deep link, where the fetch really is
 * the first thing that can paint. See post/store.js → load.
 *
 * The open runs through `useIsomorphicLayoutEffect` so the seed lands before paint; a plain
 * `useEffect` would flash the skeleton for a frame. */
export const usePost = (postId) => {
    const [current, ready, load, reset] = usePostStore(
        useShallow(state => ([
            state.current,
            state.ready,
            state.load,
            state.reset,
        ])),
    )

    useIsomorphicLayoutEffect(() => {
        if (!postId) return
        load(postId)
        return () => reset()
    }, [postId, load, reset])

    const skeleton = !ready

    return useMemo(() => ({ post: current, skeleton }), [current, skeleton])
}

/* The like action on its own, for the components that render a heart but don't own the post
 * — the feed card and the post surface's action row. Both call this rather than being handed
 * the action down through props (see frontend-architecture.md → Prop drilling), and both get
 * the same store action, which is what keeps the two copies of a post in agreement. */
export const usePostLike = () => {
    const toggle = usePostStore(state => state.toggleLike)
    const toggleLike = useCallback((postId) => toggle(postId), [toggle])

    return useMemo(() => ({ toggleLike }), [toggleLike])
}

/* Deleting, for the options menu — which is rendered on every surface a post appears on and
 * owns the post no more than the heart does. Same reasoning as `usePostLike`: the action
 * belongs to the store that owns the entity, and every surface reaches for the same one so
 * the feed's card and the open overlay cannot disagree about whether a post still exists.
 *
 * `dismiss` is passed through to the store rather than run here, because the surface has to
 * close *with* the removal and not a round trip after it. Omit it from the feed card, where
 * there is nothing to close. */
export const usePostDelete = () => {
    const removePost = usePostStore(state => state.remove)
    const remove = useCallback(
        (postId, dismiss) => removePost(postId, dismiss),
        [removePost],
    )

    return useMemo(() => ({ remove }), [remove])
}
