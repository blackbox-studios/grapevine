"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { MEMBERSHIP_STATUS, ROLES } from "@/lib/constants"
import { useGroups, usePrivileged, useUser } from "@/lib/store/auth/hook"
import useMembersStore from "./store"

/* The parish roster, and the admissions desk.
 *
 * Resolves the group from the viewer rather than taking it as a prop — the page already
 * knows who is signed in, so passing an id down would be prop drilling around a store that
 * is the cheaper source of truth. */
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
    const { primary } = useGroups()
    const viewer = useUser()

    /* Resolved against the group actually being loaded, not the viewer's default, because
     * a role is per-group and this hook only ever reads one. */
    const allowed = usePrivileged(ROLES.ADMIN, primary?.id)

    /* Gated on the role, so a member never sends the request at all.
     *
     * The endpoint is admin-only and would answer 403, which the route gate on the page
     * cannot prevent: hooks run during render, so the fetch has already left before
     * <PrivilegedRoute> gets to redirect. Asking and being refused is what produced a
     * member being told "Only group admins can do that" while being bounced out of a page
     * they never chose to open. */
    useEffect(() => {
        if (allowed && primary?.id) load(primary.id)
    }, [allowed, primary?.id, load])

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
        group: primary,
        skeleton,
        invite,
        inviting: loadingInvite,
        updating,
        restore,
        revoke,
        setVocation,
        setRole,
    }), [
        members, primary, skeleton,
        invite, loadingInvite, updating, restore, revoke, setVocation, setRole,
    ])
}
