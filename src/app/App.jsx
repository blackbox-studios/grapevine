"use client"

import { useEffect } from "react"

import useErrorListener from "@/lib/hooks/useErrorListener.hook"
import useGlobalStore from "@/lib/store/global.store"
import useAuthStore from "@/lib/store/auth/store"

/* App-wide side effects, mounted once by the root layout. Renders nothing — the
 * stores are module-level Zustand (not React context), so this doesn't need to wrap
 * anything or sit inside a provider. Two effects:
 *   1. Warm the authorized stores in the background once logged in.
 *   2. Surface store errors as toasts via useErrorListener. */
export default function App() {
    const initAuthorizedStores = useGlobalStore((state) => state.initAuthorizedStores)
    const loggedIn = useAuthStore((state) => state.loggedIn)

    useEffect(() => {
        if (loggedIn) initAuthorizedStores()
    }, [loggedIn, initAuthorizedStores])

    useErrorListener()

    return null
}
