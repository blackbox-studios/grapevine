"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { ROUTES } from "@/lib/constants"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { useAuthed } from "@/lib/store/auth/hook"

/* The route guards, mounted by the two route-group layouts.
 *
 * These are client guards because the app ships as a static export (see
 * native-architecture.md): `output: "export"` drops middleware.js on the floor — Next says
 * so during the build — and a Capacitor WebView has no server to redirect from in the
 * first place. So the gate has to be here, and being here it is the *only* gate, which is
 * the point: web and native then enforce auth identically instead of diverging.
 *
 * Both gates render nothing until mounted. `loggedIn` lives in localStorage (the auth
 * store's `persist`), which no prerender can see, so the build-time HTML is always the
 * signed-out view; useMounted defers the decision to the client, where the persisted value
 * is already restored on the first render — no flash of the wrong side of the gate, and no
 * hydration mismatch. In the native app the splash screen is still up while this settles
 * (see lib/native.js), so the redirect is invisible.
 *
 * Redirects are `replace`, not `push`: a bounced navigation must not leave an entry behind
 * for the back gesture to land on. */
export const ProtectedGate = ({ children }) => {
    const loggedIn = useAuthed()
    const mounted = useMounted()
    const router = useRouter()

    useEffect(() => {
        if (mounted && !loggedIn) router.replace(ROUTES.PUBLIC.LOGIN)
    }, [mounted, loggedIn, router])

    return mounted && loggedIn ? children : null
}

/* The mirror image: keeps a signed-in user off the login page. */
export const PublicGate = ({ children }) => {
    const loggedIn = useAuthed()
    const mounted = useMounted()
    const router = useRouter()

    useEffect(() => {
        if (mounted && loggedIn) router.replace(ROUTES.DEFAULT)
    }, [mounted, loggedIn, router])

    return mounted && !loggedIn ? children : null
}
