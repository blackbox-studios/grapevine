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
