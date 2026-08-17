import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import { useGroups } from "@/lib/store/auth/hook"
import useFeedStore from "./store"

/* The dashboard feed. One page at a time: `hasMore` comes from the server's cursor being
 * non-null, `loadMore` appends the next page, and `refresh` (pull-to-refresh) replaces the
 * first one.
 *
 * The open post is `usePost` in `lib/store/post/hook.js` — including its like action, which
 * the feed card calls. */
export const useFeed = () => {
    const [posts, ready, hasMore, loadingMore, init, refresh, loadMore] = useFeedStore(
        useShallow(state => ([
            state.items,
            state.ready,
            state.hasMore,
            state.loading.more,
            state.init,
            state.refresh,
            state.loadMore,
        ])),
    )

    useEffect(() => {
        init()
    }, [init])

    /* Skeleton derives straight from readiness, so it paints on the first frame and stays
     * until the initial load lands. Refreshes keep `ready` true and so never re-flash it. */
    const skeleton = !ready

    return useMemo(() => ({
        posts,
        skeleton,
        hasMore,
        loadingMore,
        refresh,
        loadMore,
    }), [posts, skeleton, hasMore, loadingMore, refresh, loadMore])
}

/* Publishing, for the composer.
 *
 * Resolves the target group from the viewer rather than taking it as a prop — the session
 * already knows which groups they administer, so passing an id down would be prop drilling
 * around the cheaper source of truth. `primary` is the first group the viewer administers;
 * when someone can administer several, that is where a group picker slots in.
 *
 * `canPublish` is false for a member, but note the composer is hidden from them by
 * `<Privileged/>` anyway and the server refuses regardless — this only keeps the button
 * from being tapped in the window before the viewer resolves. */
export const usePublish = () => {
    const [publish, loading] = useFeedStore(
        useShallow(state => ([state.publish, state.loading.publish])),
    )
    const { primary } = useGroups()

    const submit = useCallback(
        ({ title, body, media } = {}) =>
            publish({ orgId: primary?.id, title, body, media }),
        [publish, primary?.id],
    )

    return useMemo(() => ({
        publish: submit,
        group: primary,
        loading,
        canPublish: Boolean(primary?.id),
    }), [submit, primary, loading])
}
