"use client"

import { useEffect } from "react"

import useErrorListener from "@/lib/hooks/useErrorListener.hook"
import useNative from "@/lib/hooks/useNative.hook"
import useGlobalStore from "@/lib/store/global.store"
import useAuthStore from "@/lib/store/auth/store"

/* App-wide side effects, mounted once by the root layout. Renders nothing — the
 * stores are module-level Zustand (not React context), so this wraps nothing. It does
 * sit inside <Providers>, because the native effects read the resolved theme. Three
 * effects:
 *   1. Warm the authorized stores in the background once logged in.
 *   2. Surface store errors as toasts via useErrorListener.
 *   3. Drive the native shell (splash, status bar, hardware back) via useNative — every
 *      part of which is a no-op in a browser. */
export default function App() {
    const initAuthorizedStores = useGlobalStore((state) => state.initAuthorizedStores)
    const loggedIn = useAuthStore((state) => state.loggedIn)

    useEffect(() => {
        if (loggedIn) initAuthorizedStores()
    }, [loggedIn, initAuthorizedStores])

    useErrorListener()
    useNative()

    return null
}
