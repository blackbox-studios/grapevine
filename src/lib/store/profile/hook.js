"use client"

import { useCallback, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useRouter } from "next/navigation"

import useIsomorphicLayoutEffect from "@/lib/hooks/useIsomorphicLayoutEffect.hook"
import useProfileStore from "./store"

/* Opening somebody's card, from anywhere. Deliberately its own hook: a byline only needs
 * "show me this person", and subscribing every comment row in a thread to the open card's
 * resource and loading state would re-render the whole thread on every fetch. */
export const useOpenProfile = () => {
    const open = useProfileStore((state) => state.open)
    return useMemo(() => ({ openProfile: open }), [open])
}

/* The open card: who it is about, and the way out.
 *
 * `handle` is the store's own `openHandle` rather than a prop, because the surface is mounted
 * once by the shell and the taps that change its subject come from four different subtrees.
 *
 * `skeleton` is false on the very first frame for the viewer's own card: `open` seeds the store
 * from `/api/me` before this surface mounts, so there is no frame in which it has nothing to
 * draw — see that store's header. It is true only for somebody else's, which has nothing to seed
 * from. `missing` separates "still loading" from "there is no such person the viewer may see",
 * which the API answers 404 for.
 *
 * The refresh runs through `useIsomorphicLayoutEffect` rather than a plain effect so a *cold*
 * card — one whose handle changed under a mounted surface — starts its fetch before paint rather
 * than a frame after it. Same call `usePost` makes. */
export const useProfileCard = () => {
    const [openHandle, openTab, current, ready, load, close, editAction] = useProfileStore(
        useShallow((state) => [
            state.openHandle,
            state.openTab,
            state.current,
            state.ready,
            state.load,
            state.close,
            state.edit,
        ]),
    )
    const router = useRouter()

    useIsomorphicLayoutEffect(() => {
        if (openHandle) load(openHandle)
    }, [openHandle, load])

    /* Editing your own card is a *place*, not a mode — the form is long enough to be a page and
     * it belongs to the account tree. The router is handed to the store action, which closes
     * the card and navigates together — see `edit` in the profile store. */
    const edit = useCallback(() => editAction(router), [editAction, router])

    return useMemo(
        () => ({
            handle: openHandle,
            openTab,
            open: Boolean(openHandle),
            profile: current,
            skeleton: !ready,
            missing: ready && current === null,
            close,
            edit,
        }),
        [openHandle, openTab, current, ready, close, edit],
    )
}

/* The follow toggle on its own, for every surface that renders the button but does not own the
 * person — the card's header and each row of its follower list. Both call this rather than
 * being handed an action down through props, and both get the same store action, which is what
 * keeps the header's button and the row's from disagreeing.
 *
 * It takes the person **whole** rather than a handle, because the action needs their id to
 * patch the list row and their current `following`/`followers` to be able to undo the guess.
 * A row in a follow list is somebody this store has never fetched, so there is nothing to look
 * the rest up from. */
export const useFollow = () => {
    const toggle = useProfileStore((state) => state.toggleFollow)
    const toggleFollow = useCallback((person) => toggle(person), [toggle])

    return useMemo(() => ({ toggleFollow }), [toggleFollow])
}
