"use client"

import { useEffect } from "react"

import useErrorListener from "@/lib/hooks/useErrorListener.hook"
import useGlobalStore from "@/lib/store/global.store"
import useAuthStore from "@/lib/store/auth/store"
import { useSession } from "@/lib/store/auth/hook"

/* App-wide side effects, mounted once by the root layout. Renders nothing — the
 * stores are module-level Zustand (not React context), so this doesn't need to wrap
 * anything or sit inside a provider. Ports the old App.jsx effects:
 *   1. Warm the authorized stores in the background once logged in.
 *   2. Surface store errors as toasts via useErrorListener. */
export default function App() {
    const initAuthorizedStores = useGlobalStore((state) => state.initAuthorizedStores)
    const loggedIn = useAuthStore((state) => state.loggedIn)

    /* Mirror the Auth0 session into the auth store. */
    useSession()

    useEffect(() => {
        if (loggedIn) initAuthorizedStores()
    }, [loggedIn, initAuthorizedStores])

    useErrorListener()

    return null
}
