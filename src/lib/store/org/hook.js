"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { ROLES } from "@/lib/constants"
import { usePrivileged, useUser } from "@/lib/store/auth/hook"
import useOrgStore from "./store"

/* The group the app is currently scoped to, and the switcher that changes it.
 *
 * `useCurrentOrg` is the one every other surface consumes. Anywhere that used to reach for
 * "the viewer's primary group" wants this instead: the feed, the composer, the roster, and
 * invites are all scoped to the selection now, not to whichever membership happened to come
 * back first. */

/* Every group the viewer belongs to.
 *
 * Read off the viewer rather than the org store, because GET /api/me already ships them
 * with a role in each and a second copy would be a second thing to go stale. Only the
 * *choice* between them lives in the org store.
 *
 * A loaded viewer always has at least one group — `access` is NONE otherwise and the gate
 * never opens the shell — so emptiness is a reliable "not loaded yet" rather than a real
 * empty state. */
export const useOrgs = () => {
    const user = useUser()

    return useMemo(() => {
        const orgs = user?.orgs ?? []
        return { orgs, skeleton: !user }
    }, [user])
}

/* The selected group, plus everything a surface needs to act inside it.
 *
 * The effect is what keeps the selection honest: it re-resolves whenever the viewer's
 * groups change, which covers the viewer arriving after the first render, an admin adding
 * this person to a new parish, and a membership being revoked out from under a persisted
 * id. `resolve` keeps a still-valid choice, so a background refresh never moves the reader.
 *
 * `isAdmin` is resolved against the *selected* group specifically. That is the whole point
 * of the switcher: someone who administers their parish and merely belongs to their diocese
 * gets the composer in one and not the other, from the same session, with no reload. */
export const useCurrentOrg = () => {
    const [currentId, ready, resolve, select] = useOrgStore(
        useShallow(state => ([state.currentId, state.ready, state.resolve, state.select])),
    )
    const { orgs } = useOrgs()

    useEffect(() => {
        resolve(orgs)
    }, [orgs, resolve])

    const current = useMemo(
        () => orgs.find(org => org.id === currentId) ?? null,
        [orgs, currentId],
    )

    const isAdmin = usePrivileged(ROLES.ADMIN, current?.id)

    return useMemo(() => ({
        current,
        /* The id on its own, which is what store actions take. Read from the resolved group
         * rather than from `currentId` directly, so a selection that has not been matched
         * against the viewer's memberships yet reads as "no group" and nothing is fetched
         * with it. */
        orgId: current?.id ?? null,
        orgs,
        isAdmin,
        select,
        /* True until a selection has been resolved. Surfaces scoped to a group hold their
         * skeleton through this rather than fetching with a null id. */
        skeleton: !ready,
    }), [current, orgs, isAdmin, select, ready])
}

/* The mobile switcher's open state, and the shift it applies to the shell.
 *
 * The panel does not sit *over* the content — it moves it. Two fixed layers travel together
 * (the scroll container and the mobile rail), so they both read `shift` from here and
 * animate it with the same value, distance and curve. The moment one of them computes its
 * own offset they visibly decouple, which is the same rule the slide routes follow for the
 * same reason. The hamburger takes no shift of its own: it lives *in* the scroll container,
 * so it is carried by the push rather than matching it.
 *
 * Deliberately does **not** register the Android back handler, even though this is where it
 * would read naturally: several separate layers call this hook, and a handler registered
 * here is one entry each on a stack meant to hold one per open surface. The panel owns its
 * own dismissal — see <OrgNavPanel/>. */
export const useOrgNav = () => {
    const [open, setOpen, toggle] = useOrgStore(
        useShallow(state => ([state.open, state.setOpen, state.toggle])),
    )

    const close = useCallback(() => setOpen(false), [setOpen])

    return useMemo(() => ({
        open,
        toggle,
        close,
        /* The x offset the shell sits at while the panel is out. A CSS variable rather than
         * a number so the width is defined once, in globals.css, next to the panel that
         * has to match it. */
        shift: open ? "var(--org-nav-width)" : 0,
    }), [open, toggle, close])
}
