import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import { useCurrentOrg } from "@/lib/store/org/hook"
import useFeedStore from "./store"

/* The dashboard feed. One page at a time: `hasMore` comes from the server's cursor being
 * non-null, `loadMore` appends the next page, and `refresh` (pull-to-refresh) replaces the
 * first one.
 *
 * The open post is `usePost` in `lib/store/post/hook.js` — including its like action, which
 * the feed card calls. */
export const useFeed = () => {
    const [posts, ready, hasMore, loadingMore, load, refresh, loadMore] = useFeedStore(
        useShallow(state => ([
            state.items,
            state.ready,
            state.hasMore,
            state.loading.more,
            state.load,
            state.refresh,
            state.loadMore,
        ])),
    )
    const { orgId, skeleton: resolvingOrg } = useCurrentOrg()

    /* This is where switching groups becomes a reload. The effect re-runs on the new id,
     * `load` sees a different group, empties the list and drops readiness — so the skeleton
     * is up on the next frame and the new parish's posts replace it when they land. */
    useEffect(() => {
        load(orgId)
    }, [orgId, load])

    /* Held through the moment before a group has been selected as well as the fetch itself.
     * Both are "there is nothing to show yet", and letting the first one fall through would
     * flash an empty feed between boot and the first request.
     *
     * A viewer who resolves to *no* group is not either of those: there is no request coming,
     * so gating on `ready` alone would spin a skeleton that nothing can ever clear. The
     * gates make that unreachable — `access` is ACTIVE only with an approved membership —
     * which is exactly why it has to resolve to the empty state rather than hang if it ever
     * becomes reachable. */
    const skeleton = resolvingOrg || (Boolean(orgId) && !ready)

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
 * Publishes into the **selected** group, which is the whole reason the switcher exists: an
 * admin of two parishes writes to whichever one they are looking at, and the same session
 * offers no composer at all in a group where they are only a member.
 *
 * `canPublish` covers both halves — a group has been resolved, and the viewer administers
 * that one. The composer is hidden from a member by `<Privileged/>` anyway and the server
 * refuses regardless (`requireMembership(..., { role: "ADMIN" })`); this keeps the button
 * from being tapped in the window before the selection settles. */
export const usePublish = () => {
    const [publish, loading] = useFeedStore(
        useShallow(state => ([state.publish, state.loading.publish])),
    )
    const { current, orgId, isAdmin } = useCurrentOrg()

    const submit = useCallback(
        ({ title, body, media } = {}) => publish({ orgId, title, body, media }),
        [publish, orgId],
    )

    return useMemo(() => ({
        publish: submit,
        org: current,
        loading,
        canPublish: Boolean(orgId) && isAdmin,
    }), [submit, current, orgId, isAdmin, loading])
}
