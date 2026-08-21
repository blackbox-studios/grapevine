import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from 'zustand/react/shallow'

import { ROLES } from "@/lib/constants"
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
 * **The composer names its target; it does not inherit the selection.** That is the one
 * place in the app where the switcher is not the answer: someone who administers two
 * parishes is often reading one and writing to the other, and making them switch first turns
 * one action into three. So this hands back `orgs` — the groups they may *publish into*,
 * which is a subset of the groups they belong to — and takes the chosen id back on submit.
 *
 * `defaultOrgId` is the selection when they administer it, and otherwise the first group
 * they do. That covers the common case (write where you are) without ever preselecting a
 * group the publish would be refused for.
 *
 * Publishing elsewhere then **switches to it**, which is not a side effect but the point: a
 * post the author cannot see is indistinguishable from one that failed. The switch also
 * makes the feed's own reload the thing that shows it, which is why `publish` skips its
 * optimistic row in that case — see the store.
 *
 * `canPublish` is "there is at least one group to publish into". The button above this is
 * hidden from a member by `<Privileged anyOrg/>` anyway and the server refuses regardless
 * (`requireMembership(..., { role: "ADMIN" })`); this is what keeps Post from firing in the
 * window before the viewer has loaded. */
export const usePublish = () => {
    const [publish, loading] = useFeedStore(
        useShallow(state => ([state.publish, state.loading.publish])),
    )
    const { orgId, orgs, isAdmin, select } = useCurrentOrg()

    const publishable = useMemo(
        () => orgs.filter(org => org.role === ROLES.ADMIN),
        [orgs],
    )

    const submit = useCallback(
        async ({ orgId: target, title, body, media } = {}) => {
            const post = await publish({ orgId: target, title, body, media })
            if (post && target !== orgId) select(target)
            return post
        },
        [publish, orgId, select],
    )

    return useMemo(() => ({
        publish: submit,
        orgs: publishable,
        defaultOrgId: (isAdmin ? orgId : publishable[0]?.id) ?? null,
        loading,
        canPublish: publishable.length > 0,
    }), [submit, publishable, isAdmin, orgId, loading])
}
