"use client"

import { useEffect } from "react"

import useErrorListener from "@/lib/hooks/useErrorListener.hook"
import useNative from "@/lib/hooks/useNative.hook"
import { useAuthed, useAuthInit } from "@/lib/store/auth/hook"
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
 *   4. Drive the native shell (splash, status bar, hardware back) via useNative — every
 *      part of which is a no-op in a browser. */
export default function App() {
    const initAuthorizedStores = useGlobalStore((state) => state.initAuthorizedStores)
    /* `useGlobalStore` above is the sanctioned direct read (frontend-architecture.md →
     * app/App.jsx); auth is not — it goes through its hook. */
    const loggedIn = useAuthed()

    useAuthInit()

    useEffect(() => {
        if (loggedIn) initAuthorizedStores()
    }, [loggedIn, initAuthorizedStores])

    useErrorListener()
    useNative()

    return null
}
