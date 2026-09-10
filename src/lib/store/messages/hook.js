"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import { MESSAGES_POLL_MS, ROUTES } from "@/lib/constants"
import { useRouteOpener } from "@/lib/hooks/useSlideRoute.hook"
import { isAdult } from "@/lib/utils"
import { useUser } from "@/lib/store/auth/hook"
import useNotificationsStore from "@/lib/store/notifications/store"
import useMessagesStore from "./store"

/* The messaging surfaces' hooks. Layering as everywhere: components touch these, these
 * touch the store, the store touches the API and the crypto engine. */

/* Mounted once in the protected shell. Registers this install's keys the moment an
 * adult viewer is in — not when they first open the inbox — because being *reachable*
 * is the half of E2EE the other person depends on: a parishioner who has never tapped
 * the send icon must still be able to receive their priest's first message. */
export const useMessagingBoot = () => {
    const user = useUser()
    const boot = useMessagesStore((state) => state.boot)

    useEffect(() => {
        if (user?.id) boot(user)
    }, [user, boot])
}

/* Whether the viewer may see messaging at all — the nav entries render off this, so
 * a minor never sees the entrance. The server refuses them regardless. */
export const useMessagingAvailable = () => {
    const user = useUser()
    return Boolean(user && isAdult(user.birthday))
}

/* The badge on the send icon: how many conversations hold something unread. Lives in
 * the notifications store because it arrives on that store's poll. */
export const useUnreadMessages = () => useNotificationsStore((state) => state.messages)

/* The inbox list. Polls while mounted — messaging is the one surface where ten
 * seconds of staleness reads as broken — and leans on push to cover the background. */
export const useInbox = () => {
    const [available, ready, conversations, loading, error, refreshInbox] = useMessagesStore(
        useShallow((state) => [
            state.available,
            state.ready,
            state.conversations,
            state.loading,
            state.error,
            state.refreshInbox,
        ]),
    )

    useEffect(() => {
        if (!available) return
        refreshInbox({ silent: ready })
        const timer = setInterval(() => refreshInbox({ silent: true }), MESSAGES_POLL_MS)
        return () => clearInterval(timer)
        /* `ready` is deliberately not a dependency: it flips once after the first
         * load, and re-running the effect then would double-fetch and reset the
         * interval for nothing. */
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [available, refreshInbox])

    return useMemo(
        () => ({
            available,
            conversations,
            skeleton: available && !ready,
            loading: loading.inbox,
            error: error.inbox,
        }),
        [available, conversations, ready, loading.inbox, error.inbox],
    )
}

/* One open thread: opens on mount, polls while open, closes on unmount. */
export const useConversation = (conversationId) => {
    const [
        thread,
        loading,
        error,
        open,
        refreshThread,
        loadOlder,
        send,
        retry,
        accept,
        remove,
        block,
        closeThread,
    ] = useMessagesStore(
        useShallow((state) => [
            state.thread,
            state.loading,
            state.error,
            state.open,
            state.refreshThread,
            state.loadOlder,
            state.send,
            state.retry,
            state.accept,
            state.remove,
            state.block,
            state.closeThread,
        ]),
    )
    const available = useMessagesStore((state) => state.available)

    useEffect(() => {
        if (!available || !conversationId) return
        open(conversationId)
        const timer = setInterval(() => refreshThread(), MESSAGES_POLL_MS)
        return () => {
            clearInterval(timer)
            closeThread()
        }
    }, [available, conversationId, open, refreshThread, closeThread])

    const removeThis = useCallback(() => remove(conversationId), [remove, conversationId])
    const blockThis = useCallback(() => block(conversationId), [block, conversationId])

    return useMemo(
        () => ({
            conversation: thread?.conversation ?? null,
            items: thread?.items ?? [],
            hasOlder: Boolean(thread?.hasMore),
            skeleton: loading.thread && (thread?.items.length ?? 0) === 0,
            sending: loading.send,
            loadingOlder: loading.older,
            error: error.thread,
            sendError: error.send,
            send,
            retry,
            accept,
            remove: removeThis,
            block: blockThis,
            loadOlder,
        }),
        [thread, loading.thread, loading.send, loading.older, error.thread, error.send,
         send, retry, accept, removeThis, blockThis, loadOlder],
    )
}

/* Opening a thread with one person, for the places that already know who: the
 * button on their profile card. The New Message sheet has `useNewMessage` because it
 * additionally has to *find* somebody; this is the half of it that is just the tap. */
export const useStartConversation = () => {
    const [opening, startWith] = useMessagesStore(
        useShallow((state) => [state.loading.open, state.startWith]),
    )
    const available = useMessagingAvailable()
    const openRoute = useRouteOpener()

    const start = useCallback(
        async (profileId) => {
            const conversationId = await startWith(profileId)
            if (conversationId) openRoute(`${ROUTES.CONVERSATION}/${conversationId}`)
            return conversationId
        },
        [startWith, openRoute],
    )

    return useMemo(() => ({ start, opening, available }), [start, opening, available])
}

/* The New Message sheet: a live-searched contact list and the tap that opens (or
 * finds) a person's thread. Debouncing is the component's business; this just runs
 * the query it is handed. */
export const useNewMessage = () => {
    const [contacts, loading, error, searchContacts, startWith] = useMessagesStore(
        useShallow((state) => [
            state.contacts,
            state.loading,
            state.error,
            state.searchContacts,
            state.startWith,
        ]),
    )

    return useMemo(
        () => ({
            contacts: contacts.items,
            loaded: contacts.loaded,
            searching: loading.contacts,
            opening: loading.open,
            error: error.contacts,
            search: searchContacts,
            startWith,
        }),
        [contacts.items, contacts.loaded, loading.contacts, loading.open, error.contacts,
         searchContacts, startWith],
    )
}
