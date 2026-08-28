"use client"

import { useEffect } from "react"

import useErrorListener from "@/lib/hooks/useErrorListener.hook"
import useNative from "@/lib/hooks/useNative.hook"
import { useAuthGate, useAuthInit } from "@/lib/store/auth/hook"
import { useNotificationsWatch, useUnreadTitle } from "@/lib/store/notifications/hook"
import useGlobalStore from "@/lib/store/global.store"

/* App-wide side effects, mounted once by the root layout. Renders nothing — the
 * stores are module-level Zustand (not React context), so this wraps nothing. It does
 * sit inside <Providers>, because the native effects read the resolved theme. Four
 * effects:
 *   1. Resolve the session — reconcile the persisted guess against Supabase, and consume a
 *      magic-link callback out of the URL if there is one. This lives here, above both
 *      route groups, because the route gates must not decide before it has finished; doing
 *      it from the login page (as it once did) meant a cold load of a protected route
 *      redirected first and asked afterwards.
 *   2. Warm the authorized stores in the background once logged in.
 *   3. Surface store errors as toasts via useErrorListener.
 *   4. Drive the native shell (splash, status bar, hardware back, push) via useNative —
 *      every part of which is a no-op in a browser.
 *   5. Keep the notification bell current on clients push cannot reach, via
 *      useNotificationsWatch.
 *   6. Carry the unread tally into the browser tab — "(3) Grapevine" — via useUnreadTitle. */
export default function App() {
    const initAuthorizedStores = useGlobalStore((state) => state.initAuthorizedStores)
    /* `useGlobalStore` above is the sanctioned direct read (frontend-architecture.md →
     * app/App.jsx); auth is not — it goes through its hook. */
    const { ready, loggedIn } = useAuthGate()

    useAuthInit()

    useEffect(() => {
        if (loggedIn) initAuthorizedStores()
    }, [loggedIn, initAuthorizedStores])

    useErrorListener()
    /* The session is handed down because the native shell now owns the push listeners, and a
     * notification tapped from a cold launch must not be routed until there is a session to
     * route it into. See usePushListeners.
     *
     * **`ready &&`, not `loggedIn` alone**, and that is the whole point of passing it. A
     * banner tapped from a force-quit app parks its destination in the push store within the
     * first frames, while `loggedIn` is still the *persisted guess* rehydrated off disk and
     * `init()` has not yet asked Supabase anything. Flushing on that guess opens the slide
     * before <SlideRouter/> is mounted — and `takePending()` clears the destination on its way
     * past, so the tap lands on the feed and the post is lost. `ready` is the same "the
     * question has been answered" the route gates wait for; see useAuthGate. */
    useNative(ready && loggedIn)
    useNotificationsWatch(ready && loggedIn)
    /* Ungated: `unread` is zero without a session, and a gate would freeze a stale count in
       the tab at sign-out instead of letting it fall to zero. */
    useUnreadTitle()

    return null
}
