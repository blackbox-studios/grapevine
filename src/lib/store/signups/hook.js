"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { useRouter } from "next/navigation"

import { ROUTES, SIGNUP_STATUS } from "@/lib/constants"
import { useNow } from "@/lib/hooks/useNow.hook"
import useCalendarStore from "@/lib/store/calendar/store"
import { useCurrentOrg } from "@/lib/store/org/hook"
import useSheetStore from "@/lib/store/sheet/store"
import { summarize } from "@/lib/utils"
import useSignupsStore from "./store"

/* A group's sign-up sheets, and the viewer's own places on them.
 *
 * Resolves the group from the switcher rather than taking it as a prop, like every other
 * org-scoped surface: the shell already knows which parish is selected, and a store is the
 * cheaper source of truth than a prop threaded down.
 *
 * Unlike the roster this is **not** gated on being an admin. Everybody in the parish reads the
 * rotas; only publishing one is an admin's.
 *
 * **Every number on this surface is counted here**, from the slots the rows already carry —
 * see `summarize`. Nothing is a stored tally, so a claim moves the row's sentence by replacing
 * one slot, and there is no second copy of the arithmetic to drift from this one. */
export const useSignups = () => {
    const [items, ready, hasMore, loadingMore, load, loadMore, refresh] = useSignupsStore(
        useShallow(state => ([
            state.items,
            state.ready,
            state.hasMore,
            state.loading.more,
            state.load,
            state.loadMore,
            state.refresh,
        ])),
    )
    const { orgId, skeleton: resolvingOrg } = useCurrentOrg()
    const now = useNow()

    useEffect(() => {
        if (orgId) load(orgId)
    }, [orgId, load])

    /* Open rotas first, then closed ones, each already newest-first from the server, and each
     * carrying the sentence its collapsed row says.
     *
     * Sorted here rather than in the query because "open" is not a sort key the keyset cursor
     * can carry — pagination is on `(createdAt, id)`, and adding status to it would make the
     * cursor compare three columns to reorder a list a parish never pages past the first page
     * of. The tradeoff is honest: a closed sheet on page one sits above an open one on page
     * two, which is a case a parish with twenty rotas does not have. */
    const sheets = useMemo(() => {
        /* Three tiers, and the middle one is the point: a festival's car park is a rota that
         * *finishes*, and once its weekend has passed it is a row nobody needs above the
         * kitchen rota that runs every week. It is not deleted — who did what is worth
         * keeping — it simply stops competing for the top of the list. An ongoing rota can
         * never reach that tier, because the server keeps topping its dates up. */
        const rank = (sheet) => {
            if (sheet.status !== SIGNUP_STATUS.OPEN) return 2
            return sheet.finished ? 1 : 0
        }

        return items
            .map(sheet => {
                const summary = summarize(sheet.slots, now)
                return { ...sheet, ...summary, finished: summary.dates === 0 && !sheet.repeats }
            })
            .sort((a, b) => rank(a) - rank(b))
    }, [items, now])

    return useMemo(() => ({
        sheets,
        hasMore,
        loadingMore,
        loadMore,
        refresh,
        skeleton: resolvingOrg || !ready,
    }), [sheets, hasMore, loadingMore, loadMore, refresh, resolvingOrg, ready])
}

/* Which half of the Events page is showing, and whether an admin is reading or editing it.
 *
 * A hook of its own so the page's chrome can subscribe to the two values without the list, and
 * so the three places that *set* them from outside — a tapped reminder, a tapped push banner,
 * and the group tree's Manage events row — reach them the same way. */
export const useEventsView = () => {
    const [tab, mode, setTab, setMode] = useSignupsStore(
        useShallow(state => ([state.tab, state.mode, state.setTab, state.setMode])),
    )
    const { isAdmin } = useCurrentOrg()

    /* **Switching tabs puts both halves back to their root.** Leaving the calendar on a day and
     * a rota open is leaving two surfaces buried under a control that says nothing about them —
     * come back to Sign-ups and you are three levels in, on a rota you opened before going to
     * look at something else. The tab bar is the top of this page, so pressing it should mean
     * the top of this page.
     *
     * Composed in the hook rather than in a store, and that is the layering rule rather than a
     * preference: `sheet` already imports `signups`, so a `signups` action reaching back into it
     * would be the cycle the store headers warn about. A hook is the layer allowed to touch more
     * than one store — the same shape `useOrgCreator` takes. */
    const changeTab = useCallback(
        (next) => {
            setTab(next)
            useSheetStore.getState().close()
            useCalendarStore.getState().closeDay()
        },
        [setTab],
    )

    /* Edit mode is an admin's, and the switch is checked here rather than trusted from
     * wherever it was set: a role can be revoked while the page is open, and the server would
     * refuse every write behind a control still on screen. */
    const editing = mode === "edit" && isAdmin

    return useMemo(
        () => ({ tab, setTab: changeTab, editing, canEdit: isAdmin, setMode }),
        [tab, changeTab, editing, isAdmin, setMode],
    )
}

/* Publishing and retiring a rota — for the edit mode, which is the only entrance.
 *
 * Split from `useSignups` so the list is not re-rendered on every keystroke of the create
 * form, the same reason `useEditOrg` is split from `useOrgSettings`. */
export const useSignupAdmin = () => {
    const [createSheet, removeSheet, saving] = useSignupsStore(
        useShallow(state => ([state.createSheet, state.removeSheet, state.loading.write])),
    )
    const { orgId } = useCurrentOrg()

    const create = useCallback(
        (input) => createSheet({ ...input, orgId }),
        [createSheet, orgId],
    )

    return useMemo(() => ({ create, remove: removeSheet, saving }), [create, removeSheet, saving])
}

/* The group tree's Manage events row: turn edit mode on and go to the Events page.
 *
 * A hook of its own so that row subscribes to nothing — it only ever writes. The two halves are
 * one action in the store (`manage`) rather than two calls here, so an entrance cannot set half
 * of it and land somebody on the calendar in an edit mode they cannot see. */
export const useManageEvents = () => {
    const manage = useSignupsStore(state => state.manage)
    const router = useRouter()

    const manageEvents = useCallback(() => {
        manage()
        router.push(ROUTES.EVENTS, { scroll: false })
    }, [manage, router])

    return useMemo(() => ({ manageEvents }), [manageEvents])
}
