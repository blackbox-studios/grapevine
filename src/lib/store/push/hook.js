"use client"

import { useCallback, useEffect } from "react"
import { useShallow } from "zustand/react/shallow"

import { ROUTES } from "@/lib/constants"
import { openSlide } from "@/lib/hooks/useSlideRoute.hook"
import { onPushReceived, onPushTapped, onPushTokenChange, pushSupported } from "@/lib/push"
import useNotificationsStore from "@/lib/store/notifications/store"
import usePushStore from "./store"

/* The listeners that have to be alive for as long as the app is, mounted once from
 * `useNative()`. Everything it registers is a no-op off-device.
 *
 * **Registered unconditionally, not behind `loggedIn`.** A cold launch from a tapped banner
 * delivers that tap almost immediately — well before the session has been resolved — and a
 * listener attached after the fact never hears it. The store parks the destination instead
 * and `flushPending` opens it when there is somewhere to go. Gating the listener on the
 * session is what makes a tapped notification open the feed and nothing else, which is the
 * bug this shape exists to avoid.
 *
 * `ready` is what "somewhere to go" means: a resolved, signed-in session. It arrives as an
 * argument rather than being read from the auth store, so that `push` imports nothing above
 * it — the same one-directional rule that keeps `comments` → `post` → `feed` acyclic. */
export const usePushListeners = (ready) => {
    const [pending, openFromPush, takePending] = usePushStore(
        useShallow(state => ([state.pending, state.openFromPush, state.takePending])),
    )

    /* A tap, from a banner or from a cold launch. Records the destination only. */
    useEffect(() => {
        if (!pushSupported()) return
        return onPushTapped(postId => openFromPush(postId))
    }, [openFromPush])

    /* …and opens it, once there is somewhere to open it.
     *
     * `openSlide` rather than `router.push`, because a post has no route: its id was unknown
     * at build time and `output: "export"` demands `generateStaticParams` for every dynamic
     * segment. This is the same shallow-history navigation the feed uses — see the Slide
     * routes section of frontend-architecture.md. */
    useEffect(() => {
        if (!ready || !pending) return

        const postId = takePending()
        if (postId) openSlide(`${ROUTES.POST}/${postId}`)
    }, [ready, pending, takePending])

    /* A push that landed with the app already open. No banner is drawn — the reader is
     * looking at the app — so the only thing it means is that the bell is now behind. */
    useEffect(() => {
        if (!pushSupported()) return
        return onPushReceived(() => useNotificationsStore.getState().refreshUnread())
    }, [])

    /* The SDK rotating this installation's token. Re-registering is the only thing standing
     * between a reinstalled app and permanent silence — see `onPushTokenChange`. Only while
     * signed in, because the POST needs a bearer token; a rotation that happens signed out is
     * picked up by `sync()` on the next sign-in anyway. */
    useEffect(() => {
        if (!pushSupported() || !ready) return
        return onPushTokenChange(() => usePushStore.getState().sync())
    }, [ready])
}

/* The permission state and the deliberate ask, for whatever surface offers to turn this on.
 *
 * `enable` resolves to whether push is now live, so the caller can say something about a
 * refusal — the one outcome the app cannot recover from on its own, since iOS will not prompt
 * a second time. */
export const usePushPermission = () => {
    const [permission, enabling, enable] = usePushStore(
        useShallow(state => ([state.permission, state.loading.enable, state.enable])),
    )

    return {
        supported: pushSupported(),
        /* "granted" | "denied" | null, where null is "never asked". */
        permission,
        enabling,
        enable: useCallback(() => enable(), [enable]),
    }
}
