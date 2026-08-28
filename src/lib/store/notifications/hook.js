"use client"

import { useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import { useShallow } from "zustand/react/shallow"

import { APP_NAME, NOTIFICATIONS_POLL_MS } from "@/lib/constants"
import { pushSupported } from "@/lib/push"
import usePushStore from "@/lib/store/push/store"
import useNotificationsStore from "./store"

/* The panel behind the bell. Mounting this hook is what opens it — the read is on mount
 * rather than on a prop, because every surface that renders the list (the desktop popover,
 * the mobile slide route) is itself only mounted while it is open.
 *
 * **That read is an update, not a load.** The rows arrived at boot (`init` → `refresh`), so
 * by the time anybody opens the panel `ready` is set and `load` takes its `sync` branch: the
 * list paints from the store on the first frame and anything that arrived since is merged in
 * behind it. The skeleton below is what is left for the case the preload failed.
 *
 * Reading is a side effect of that mount, and it is the whole "the bell stays lit until you
 * read the page" behaviour: the badge clears the moment the list is on screen. `markRead` is
 * called on every open, including the ones with nothing to mark — see the note on it in the
 * store for why it may not be skipped on a cached count of zero.
 *
 * **Unmounting is the other half.** The rows keep their tint for as long as the panel is up,
 * so closing it is what settles them — the one moment all three surfaces share, and the reason
 * `settleRead` hangs off this effect's cleanup rather than off a close handler.
 *
 * The list itself is **not** cleared on unmount, unlike the open post's. There is one panel,
 * its contents are the same whichever surface showed them, and it is meant to outlive every
 * surface that shows it — that is what the preload is for. */
export const useNotifications = () => {
    const [items, ready, hasMore, loadingMore, load, loadMore, markRead, settleRead] =
        useNotificationsStore(
            useShallow(state => ([
                state.items,
                state.ready,
                state.hasMore,
                state.loading.more,
                state.load,
                state.loadMore,
                state.markRead,
                state.settleRead,
            ])),
        )

    /* **Ordered, not concurrent.** Both halves touch `unread`: `load` reads the tally
     * (alongside the list, in `sync`'s or `refresh`'s Promise.all) and `markRead` writes it to
     * zero. Fired together, the read can be answered before the mark-read commits and still
     * settle last, which writes the pre-read count back over the cleared badge. Awaiting the
     * read first means the only tally left standing is the one `markRead` gets back. */
    useEffect(() => {
        const open = async () => {
            await load()
            await markRead()
        }
        open()

        /* Closing the panel is what takes the highlight away — see `settleRead`. It belongs
         * here rather than on the surfaces because there are three of them (the popover, the
         * slide route, its cold-load form) and unmounting is the one thing they all do on the
         * way out. */
        return () => settleRead()
    }, [load, markRead, settleRead])

    /* The fallback, not the normal path. With the list preloaded at boot, `ready` is set long
     * before anybody opens the panel and this never fires; what is left for it is the viewer
     * who opens the bell while the preload is still in flight, or after it failed. */
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

/* The same tally, in the browser tab: "(3) Grapevine", and plain "Grapevine" once read.
 * Mounted once from App.jsx for the session.
 *
 * **The bell is only visible while the app is**, and the tab title is the one place this
 * number reaches somebody who is reading something else — which is most of the time a parish
 * feed is open. It clears itself: `markRead` writes `unread` to zero when the panel mounts,
 * this re-runs, and the title goes back to the name.
 *
 * `pathname` is a dependency, and not for anything this hook does with it. Next renders the
 * root layout's `metadata.title` per route, so a client navigation reconciles the `<title>`
 * element and resets `document.title` to the static name — over the count we just wrote. The
 * effect re-runs after the navigation and puts it back. Slide routes push through
 * `usePathname` too and re-run this harmlessly, writing the string it already holds.
 *
 * No cleanup, and none is right: this is mounted for the life of the document, and the only
 * ways out — a sign-out, which zeroes `unread`, and closing the tab — both settle the title
 * without one.
 *
 * Inert rather than gated on native: a WebView has no tab, so setting `document.title` there
 * is a string assignment nothing renders. Not worth an `isNative()` branch to skip. */
export const useUnreadTitle = () => {
    const unread = useUnreadCount()
    const pathname = usePathname()

    useEffect(() => {
        document.title = unread > 0 ? `(${unread}) ${APP_NAME}` : APP_NAME
    }, [unread, pathname])
}

/* Keeps the bell current wherever push cannot. Mounted once from App.jsx for the session.
 *
 * **Reachable is not the same as native**, and the gate has to test the former: an iPhone
 * without the APNs half of push, a reader who declined the permission prompt, and a device
 * whose token registration failed are all native and all unreachable, and for them a poll is
 * the only thing standing between a notification and a cold launch. So the condition is a
 * permission granted *and* a token registered — a working install still polls nothing.
 *
 * Polling rather than the two realtime options, both of which cost more than they save here.
 * Supabase Realtime needs the `anon`/`authenticated` grants and RLS policies `db:secure`
 * revokes, reopening the Data API that the whole `/api` layer exists to keep shut. SSE would
 * hold a connection per viewer for a signal that fires a few times a day.
 *
 * **Idle clients cost nothing**: `visibilitychange` stops the timer whenever the tab or the app
 * is not on screen and checks once on the way back, which is the moment the tally is most
 * likely to be stale. */
export const useNotificationsWatch = (active) => {
    const delivering = usePushStore(
        state => pushSupported() && state.permission === "granted" && Boolean(state.token),
    )

    useEffect(() => {
        if (!active || delivering) return

        let timer = null

        const check = () => useNotificationsStore.getState().pollUnread()

        const start = () => {
            if (timer) return
            timer = setInterval(check, NOTIFICATIONS_POLL_MS)
        }

        const stop = () => {
            if (!timer) return
            clearInterval(timer)
            timer = null
        }

        const onVisibility = () => {
            if (document.hidden) return stop()
            check()
            start()
        }

        /* Mount starts the timer without checking: this goes active as `init` fires, whose
         * read is already on its way. */
        if (!document.hidden) start()
        document.addEventListener("visibilitychange", onVisibility)

        return () => {
            stop()
            document.removeEventListener("visibilitychange", onVisibility)
        }
    }, [active, delivering])
}
