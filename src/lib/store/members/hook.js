"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { MEMBERSHIP_STATUS } from "@/lib/constants"
import { useUser } from "@/lib/store/auth/hook"
import { useCurrentOrg } from "@/lib/store/org/hook"
import useMembersStore from "./store"

/* The parish roster, and the admissions desk.
 *
 * Resolves the group from the switcher rather than taking it as a prop — the shell already
 * knows which one is selected, so passing an id down would be prop drilling around a store
 * that is the cheaper source of truth. Switching groups reloads the table, and an admin of
 * two parishes admits people to whichever one they are looking at. */
export const useMembers = () => {
    const [items, ready, load, invite, updateMember, loadingInvite, updating] =
        useMembersStore(useShallow(state => ([
            state.items,
            state.ready,
            state.load,
            state.invite,
            state.updateMember,
            state.loading.invite,
            state.loading.update,
        ])))
    /* `isAdmin` is already resolved against the selected group, which is the only group
     * this hook ever reads — a role is per-group, and being an admin elsewhere grants
     * nothing here. */
    const { current, orgId, isAdmin } = useCurrentOrg()
    const viewer = useUser()

    /* Gated on the role, so a member never sends the request at all.
     *
     * The endpoint is admin-only and would answer 403, which the route gate on the page
     * cannot prevent: hooks run during render, so the fetch has already left before
     * <PrivilegedRoute> gets to redirect. Asking and being refused is what produced a
     * member being told "Only group admins can do that" while being bounced out of a page
     * they never chose to open. Switching to a group the viewer only belongs to stops the
     * request for the same reason. */
    useEffect(() => {
        if (isAdmin && orgId) load(orgId)
    }, [isAdmin, orgId, load])

    const revoke = useCallback(
        (membershipId) => updateMember(membershipId, { status: MEMBERSHIP_STATUS.REVOKED }),
        [updateMember],
    )

    /* Puts a removed member back. The same status write that admission performs, which is
     * why there is no separate "approve" — an invited person is APPROVED the moment they
     * are added, so the only row this is ever aimed at is one somebody revoked. */
    const restore = useCallback(
        (membershipId) => updateMember(membershipId, { status: MEMBERSHIP_STATUS.APPROVED }),
        [updateMember],
    )

    const setVocation = useCallback(
        (membershipId, vocation) => updateMember(membershipId, { vocation }),
        [updateMember],
    )

    const setRole = useCallback(
        (membershipId, role) => updateMember(membershipId, { role }),
        [updateMember],
    )

    /* Painted on the first frame and cleared once the roster lands — including on the
     * failure path, where `ready` is set too, so a 403 resolves to the empty state. */
    const skeleton = !ready

    /* The viewer's own row, flagged here rather than compared in the table.
     *
     * An admin may not remove or demote themselves — `updateMembership` rejects both — so
     * the row has to hide the controls that would only earn an error. Marking it in the
     * hook keeps the page from reaching into a second store to ask who it is looking at. */
    const members = useMemo(
        () => items.map(item => ({ ...item, isSelf: item.id === viewer?.id })),
        [items, viewer?.id],
    )

    return useMemo(() => ({
        members,
        org: current,
        skeleton,
        invite,
        inviting: loadingInvite,
        updating,
        restore,
        revoke,
        setVocation,
        setRole,
    }), [
        members, current, skeleton,
        invite, loadingInvite, updating, restore, revoke, setVocation, setRole,
    ])
}
