"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import useFollowsStore from "./store"

/* Both follow lists of the person whose card is open.
 *
 * **Mounted once, at the card**, not per tab. The store loads the two directions together the
 * moment a card opens (see its header), so a tab switch is a re-render rather than a round trip
 * — which is the whole reason the panels can cross-fade instead of flashing a skeleton.
 *
 * Takes the handle as an argument rather than reading a selection out of a store, because the
 * card is opened *at* a person and the store that owns which person is `profile`. Changing it
 * re-runs the effect, which empties both lists and reloads, so one person's followers can never
 * appear under another's name.
 *
 * `handle` may be null while the card is closed; the store's `load` ignores it, so this hook is
 * safe to mount unconditionally. */
export const useFollows = (handle) => {
    const [lists, ready, loading, load, loadMore, reset] = useFollowsStore(
        useShallow((state) => [
            state.lists,
            state.ready,
            state.loading,
            state.load,
            state.loadMore,
            state.reset,
        ]),
    )

    useEffect(() => {
        if (!handle) return
        load(handle)
        return () => reset()
    }, [handle, load, reset])

    const more = useCallback((kind) => loadMore(kind), [loadMore])

    return useMemo(
        () => ({
            lists,
            /* Painted on the first frame and cleared once the pair lands, including on the
             * failure path where the store sets `ready` too — so a refusal settles on the empty
             * state rather than spinning. */
            skeleton: !ready,
            loadMore: more,
            loadingMore: { followers: loading.followers, following: loading.following },
        }),
        [lists, ready, more, loading.followers, loading.following],
    )
}
