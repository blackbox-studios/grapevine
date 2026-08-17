"use client"

import { useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { useGroups } from "@/lib/store/auth/hook"
import useMembersStore from "./store"

/* The User Management table.
 *
 * Resolves the group itself from the viewer rather than taking it as a prop — the page
 * already knows who is signed in, so passing an id down would be prop drilling around a
 * store that is the cheaper source of truth. */
export const useMembers = () => {
    const [items, ready, load] = useMembersStore(useShallow(state => ([
        state.items,
        state.ready,
        state.load,
    ])))
    const { primary } = useGroups()

    useEffect(() => {
        if (primary?.id) load(primary.id)
    }, [primary?.id, load])

    /* Painted on the first frame and cleared once the roster lands — including on the
     * failure path, where `ready` is set too, so a 403 resolves to the empty state. */
    const skeleton = !ready

    return useMemo(() => ({
        members: items,
        group: primary,
        skeleton,
    }), [items, primary, skeleton])
}
