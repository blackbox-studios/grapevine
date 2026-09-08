"use client"

import { useEffect } from "react"

import useErrorListener from "@/lib/hooks/useErrorListener.hook"
import useFontWarm from "@/lib/hooks/useFontWarm.hook"
import useNative from "@/lib/hooks/useNative.hook"
import { useAuthGate, useAuthInit } from "@/lib/store/auth/hook"
import { useCalendarWarm } from "@/lib/store/calendar/hook"
import { useNotificationsWatch, useUnreadTitle } from "@/lib/store/notifications/hook"
import useGlobalStore from "@/lib/store/global.store"

/* App-wide side effects, mounted once by the root layout. Renders nothing — the
 * stores are module-level Zustand (not React context), so this wraps nothing. It does
 * sit inside <Providers>, because the native effects read the resolved theme. Eight
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
 *   6. Carry the unread tally into the browser tab — "(3) Grapevine" — via useUnreadTitle.
 *   7. Pull the Daily Read's serif down on an idle moment, via useFontWarm.
 *   8. Fill the selected group's month on an idle moment, via useCalendarWarm. */
export default function App() {
    const initAuthorizedStores = useGlobalStore((state) => state.initAuthorizedStores)
    /* `useGlobalStore` above is the sanctioned direct read (frontend-architecture.md →
     * app/App.jsx); auth is not — it goes through its hook. */
    const { ready, loggedIn, settled } = useAuthGate()

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
     * past, so the tap lands on the feed and the post is lost. `settled` beside it is the
     * weaker signal the splash waits on; see useAuthGate for why the two differ. */
    useNative(ready && loggedIn, settled)
    useNotificationsWatch(ready && loggedIn)
    /* Ungated: `unread` is zero without a session, and a gate would freeze a stale count in
       the tab at sign-out instead of letting it fall to zero. */
    useUnreadTitle()
    /* Gated on the session because /prologue is behind one: nobody sitting on the login
       screen is a click away from needing the face. */
    useFontWarm(ready && loggedIn)
    /* Gated the same way, and for the same reason: there is no group to warm a calendar for
       until there is a viewer to read one out of. */
    useCalendarWarm(ready && loggedIn)

    return null
}
