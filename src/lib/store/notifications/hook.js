"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import useNotificationsStore from "./store"

/* The panel behind the bell. Mounting this hook is what opens it — the fetch is on mount
 * rather than on a prop, because every surface that renders the list (the desktop popover,
 * the mobile slide route) is itself only mounted while it is open.
 *
 * Reading is a side effect of that mount, and it is the whole "the bell stays lit until you
 * read the page" behaviour: the badge clears the moment the list is on screen. `markRead` is
 * called on every open, including the ones with nothing to mark — see the note on it in the
 * store for why it may not be skipped on a cached count of zero.
 *
 * The list is **not** cleared on unmount, unlike the open post's. There is one panel, its
 * contents are the same whichever surface showed them, and keeping the rows means re-opening
 * paints instantly and refreshes behind — `load` sees `ready` and only re-reads the tally. */
export const useNotifications = () => {
    const [items, ready, hasMore, loadingMore, load, loadMore, markRead] =
        useNotificationsStore(
            useShallow(state => ([
                state.items,
                state.ready,
                state.hasMore,
                state.loading.more,
                state.load,
                state.loadMore,
                state.markRead,
            ])),
        )

    /* **Ordered, not concurrent.** Both halves touch `unread`: `load` reads the tally (on a
     * re-open directly, on a first open inside `refresh`'s Promise.all) and `markRead` writes
     * it to zero. Fired together, the read can be answered before the mark-read commits and
     * still settle last — likely on a first open, where it waits on the heavier list query —
     * which writes the pre-read count back over the cleared badge. Awaiting the read first
     * means the only tally left standing is the one `markRead` gets back. */
    useEffect(() => {
        const open = async () => {
            await load()
            await markRead()
        }
        open()
    }, [load, markRead])

    /* Truthy on the very first render, so the skeleton is present on frame one rather than
     * fading in a beat late. Only ever true before the first load resolves — a re-open finds
     * `ready` still set and updates silently. */
    const skeleton = !ready

    return useMemo(() => ({
        items,
        skeleton,
        hasMore,
        loadingMore,
        loadMore,
    }), [items, skeleton, hasMore, loadingMore, loadMore])
}

/* The bell itself, which needs only the number.
 *
 * Deliberately does not subscribe to `items`: the trigger is mounted in the app's chrome for
 * the whole session, and re-rendering it on every page appended to a list it does not show
 * would be a subscription to the wrong thing. */
export const useUnreadCount = () => {
    const unread = useNotificationsStore(state => state.unread)
    return unread
}

/* Re-reads the tally without touching the list.
 *
 * Exposed for the surfaces that have a reason to ask again — and, when push notifications
 * land, for the Capacitor listener, which runs outside React and reaches the same action
 * through `useNotificationsStore.getState()`. */
export const useRefreshUnread = () => {
    const refreshUnread = useNotificationsStore(state => state.refreshUnread)
    return useCallback(() => refreshUnread(), [refreshUnread])
}
