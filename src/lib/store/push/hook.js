"use client"

import { useCallback, useEffect } from "react"
import { useShallow } from "zustand/react/shallow"

import { ROUTES } from "@/lib/constants"
import { signupPath } from "@/lib/utils"
import { openSlide, pushRoute } from "@/lib/hooks/useSlideRoute.hook"
import { onAppState } from "@/lib/native"
import {
    onPushReceived,
    onPushTapped,
    onPushTokenChange,
    openPushSettings,
    pushSupported,
} from "@/lib/push"
import useMessagesStore from "@/lib/store/messages/store"
import useNotificationsStore from "@/lib/store/notifications/store"
import { useOpenProfile } from "@/lib/store/profile/hook"
import { useEventsView } from "@/lib/store/signups/hook"
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
    const { openProfile } = useOpenProfile()
    const { setTab } = useEventsView()

    /* A tap, from a banner or from a cold launch. Records the destination only. */
    useEffect(() => {
        if (!pushSupported()) return
        return onPushTapped(destination => openFromPush(destination))
    }, [openFromPush])

    /* …and opens it, once there is somewhere to open it.
     *
     * `openSlide` rather than `router.push`, because a post has no route: its id was unknown
     * at build time and `output: "export"` demands `generateStaticParams` for every dynamic
     * segment. This is the same shallow-history navigation the feed uses — see the Slide
     * routes section of frontend-architecture.md. A follow points at a person instead, and a
     * card is not a route at all — it is the profile store's `openHandle`. A sign-up is the
     * third shape: a rota *is* a route (`/events/s/:id`), just a page one rather than an
     * overlay, so it is reached with `pushRoute` instead. The tab is set alongside it so backing
     * out of the rota lands on the sign-ups half rather than the calendar. */
    useEffect(() => {
        if (!ready || !pending) return

        const { postId, handle, sheetId, conversationId } = takePending() ?? {}
        if (postId) openSlide(`${ROUTES.POST}/${postId}`)
        else if (conversationId) openSlide(`${ROUTES.CONVERSATION}/${conversationId}`)
        else if (handle) openProfile(handle)
        else if (sheetId) {
            setTab("signups")
            pushRoute(signupPath(sheetId))
        }
    }, [ready, pending, takePending, openProfile, setTab])

    /* A push that landed with the app already open. No banner is drawn — the reader is looking
     * at the app — so all it means is that the panel is behind, possibly while on screen. A
     * message push additionally lands in whatever messaging surface is up: the open thread
     * refreshes — that is the receiving half of a live conversation — and otherwise the
     * inbox re-lists so the row moves and the snippet updates. */
    useEffect(() => {
        if (!pushSupported()) return
        return onPushReceived((data) => {
            useNotificationsStore.getState().sync()
            if (data?.conversationId) {
                const messages = useMessagesStore.getState()
                if (messages.thread?.id === data.conversationId) messages.refreshThread()
                else messages.refreshInbox({ silent: true })
            }
        })
    }, [])

    /* The SDK rotating this installation's token. Re-registering is the only thing standing
     * between a reinstalled app and permanent silence — see `onPushTokenChange`. Only while
     * signed in, because the POST needs a bearer token; a rotation that happens signed out is
     * picked up by `sync()` on the next sign-in anyway. */
    useEffect(() => {
        if (!pushSupported() || !ready) return
        return onPushTokenChange(() => usePushStore.getState().sync())
    }, [ready])

    /* Coming back to the foreground, which is when a trip to the OS's notification settings
     * becomes visible to us — see `refresh`. Gated on the session for the same reason as the
     * rotation above: what it does with a grant is a POST.
     *
     * The notifications list is re-read here too, and this is the case `onPushReceived` cannot
     * cover: a push delivered while the app was backgrounded draws its banner through the OS
     * and never reaches a JS callback, so returning to the foreground is the first moment we
     * can know about it. Without this, opening the app from the app switcher after a quiet
     * hour would show yesterday's panel. */
    useEffect(() => {
        if (!pushSupported() || !ready) return
        return onAppState((active) => {
            if (!active) return
            usePushStore.getState().refresh()
            useNotificationsStore.getState().sync()
        })
    }, [ready])
}

/* The permission state and the two shapes of the ask, for whatever surface offers to turn this
 * on. Both resolve to a boolean, so a caller can say something about a refusal.
 *
 * `enable` prompts and nothing else. Orientation wants that one: it asks only while a prompt
 * can still be shown, and a signup step that handed someone to the OS's settings screen would
 * be a dead end.
 *
 * `turnOn` is the standing offer, and chooses — prompt where one is possible, otherwise
 * `openPushSettings`. */
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
        turnOn: useCallback(
            () => (permission === "denied" ? openPushSettings() : enable()),
            [enable, permission],
        ),
    }
}

/* Whether this install can actually be reached by a push, which is a narrower question than
 * "is this native". An iPhone missing the APNs half, a reader who declined the prompt, and a
 * device whose token registration failed are all native and all unreachable — so the answer is
 * a granted permission *and* a registered token, not the platform.
 *
 * It lives here rather than in the one hook that asks it, because the question is entirely
 * about push's own state and the layering says a domain owns the reads over its store. The
 * caller — `useNotificationsWatch` — decides what to do with the answer.
 *
 * **Reactive on purpose.** A token can arrive mid-session: the reader accepts the prompt, or a
 * failed registration retries. Anything that polls because this was false has to stop when it
 * turns true, and a `getState()` snapshot would leave it polling for the rest of the session. */
export const usePushDelivering = () =>
    usePushStore(
        state => pushSupported() && state.permission === "granted" && Boolean(state.token),
    )
