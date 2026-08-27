"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { ROLES } from "@/lib/constants"
import {
    useCreateOrg,
    useDeleteOrg,
    usePlatformOwner,
    usePrivileged,
    useUpdateOrg,
    useUser,
} from "@/lib/store/auth/hook"
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

/* Opening the group-settings surface — for the switcher, which is the only entrance.
 *
 * Split from `useOrgEditor` below because the callers are different subtrees with different
 * needs: the switcher only ever needs "open it for this group", and subscribing it to the
 * editor's loading and error state would re-render the whole menu on every keystroke saved
 * inside the dialog. */
export const useEditOrg = () => {
    const editOrg = useOrgStore(state => state.editOrg)
    return useMemo(() => ({ editOrg }), [editOrg])
}

/* The group being edited, and everything the surface needs to edit it.
 *
 * **Reads the group out of the viewer rather than fetching it**, for the reason the org
 * store's header gives: `user.orgs` is the single copy, and a second fetch would be a second
 * thing to go stale. `save` PATCHes and the auth store swaps the row back in, so the name in
 * the switcher and the heading of the dialog move on the same frame.
 *
 * `open` is derived from `editingId` rather than stored separately — one source for "is the
 * editor up", so it cannot disagree with which group it is up for. A viewer whose membership
 * is revoked mid-edit stops resolving an `org`, which the surface renders as a dead end. */
export const useOrgEditor = () => {
    const [editingId, closeEditor] = useOrgStore(
        useShallow(state => ([state.editingId, state.closeEditor])),
    )
    const { orgs } = useOrgs()
    const { updateOrg, saving } = useUpdateOrg()
    const { deleteOrg, deleting } = useDeleteOrg()

    const org = useMemo(
        () => orgs.find(entry => entry.id === editingId) ?? null,
        [orgs, editingId],
    )

    const save = useCallback(
        (changes) => updateOrg(editingId, changes),
        [updateOrg, editingId],
    )

    /* Destroying the group the editor is open on.
     *
     * Closes on success and only on success — a failed delete leaves the dialog standing on a
     * group that still exists, which is the honest thing to show. The selection needs no help:
     * removing the row from `user.orgs` re-runs `resolve` through `useCurrentOrg`, which moves
     * the reader to another group, or to none.
     *
     * The confirmation the API wants is the slug; the surface asks the human for the name. See
     * the store action for why those are two different strings. */
    const remove = useCallback(
        async () => {
            if (!org) return false
            const done = await deleteOrg(org.id, org.slug)
            if (done) closeEditor()
            return done
        },
        [deleteOrg, org, closeEditor],
    )

    return useMemo(() => ({
        open: Boolean(editingId),
        close: closeEditor,
        org,
        save,
        saving,
        remove,
        deleting,
        /* The surface is reached only from a menu that offers it on admin rows, but a role can
         * be revoked while the dialog is open — so it checks rather than trusting the entrance. */
        canEdit: org?.role === ROLES.ADMIN,
        /* Composed by the server (`canDeleteOrg`) rather than re-derived here — it is narrower
         * than `role` and depends on who created the group, which the client is not told. */
        canDelete: Boolean(org?.canDelete),
    }), [editingId, closeEditor, org, save, saving, remove, deleting])
}

/* Opening the create-a-group surface, and whether this viewer may — for the switcher, which
 * is the only entrance, exactly as it is for the editor.
 *
 * Split from `useOrgCreator` below on the same grounds `useEditOrg` is split from
 * `useOrgEditor`: the two entrances only need "open it" and "should I be drawn at all", and
 * subscribing a menu to the form's saving state would re-render it on every keystroke. */
export const useCreateOrgEntrance = () => {
    const openCreator = useOrgStore(state => state.openCreator)
    const canCreate = usePlatformOwner()
    return useMemo(() => ({ openCreator, canCreate }), [openCreator, canCreate])
}

/* The create-a-group surface: the form's submit, and what happens after it succeeds.
 *
 * **This hook is where the two stores meet, and that is deliberate.** The write belongs to
 * the auth store (the new group lands in `user.orgs`); the selection belongs to the org store.
 * Composing them *here* rather than having one store reach into the other is what keeps the
 * imports one-directional — `org` already reads `auth`, and `auth` calling back into `org`
 * would be exactly the cycle this store's header warns about. Hooks are the layer allowed to
 * touch a store, so a hook is the right place for a mutation that spans two.
 *
 * Creating a group **selects it**, and that is not a nicety: the viewer just made this place
 * and the next thing they will do is put people in it or post to it, both of which are scoped
 * to the selection. Landing them back in the parish they happened to be reading would make
 * the new group something they then have to go and find. */
export const useOrgCreator = () => {
    const [creating, closeCreator, select] = useOrgStore(
        useShallow(state => ([state.creating, state.closeCreator, state.select])),
    )
    const { createOrg, creating: saving } = useCreateOrg()
    const canCreate = usePlatformOwner()

    /* **The picture is not set here, and that is a constraint rather than a gap.** An
     * ORG_AVATAR upload is authorized by an ADMIN membership in the group and lands in a folder
     * named after the group's id — neither of which exists until this POST returns. Setting one
     * at creation means holding the file, creating, uploading, then PATCHing: three calls and a
     * half-created state to describe when the middle one fails. Group settings opens on the new
     * group a tap later and does it in one, so that is where it stays. */
    const create = useCallback(
        async (input) => {
            const org = await createOrg(input)
            if (!org) return null
            select(org.id)
            closeCreator()
            return org
        },
        [createOrg, select, closeCreator],
    )

    return useMemo(() => ({
        open: creating,
        close: closeCreator,
        create,
        saving,
        /* Checked here rather than trusted from the entrance, for the reason `canEdit` is:
         * ownership can be revoked by the back door while the surface is open. */
        canCreate,
    }), [creating, closeCreator, create, saving, canCreate])
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
