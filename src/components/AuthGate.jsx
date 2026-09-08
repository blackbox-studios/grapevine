"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { ROUTES } from "@/lib/constants"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { useAuthGate } from "@/lib/store/auth/hook"

/* The route guards, mounted by the two route-group layouts.
 *
 * These are client guards because the app ships as a static export (see
 * native-architecture.md): `output: "export"` drops middleware.js on the floor — Next says
 * so during the build — and a Capacitor WebView has no server to redirect from in the
 * first place. So the gate has to be here, and being here it is the *only* gate, which is
 * the point: web and native then enforce auth identically instead of diverging.
 *
 * ── Two things must be true before either gate may decide ───────────────────
 *
 * **mounted** — `loggedIn` is restored from localStorage, which no prerender can see, so
 * the build-time HTML is always the signed-out view. `useMounted` defers the decision to
 * the client, where the persisted value is already there on the first render: no flash of
 * the wrong side of the gate, and no hydration mismatch.
 *
 * **settled** — the auth store has an answer worth acting on. For a returning viewer that is
 * the persisted session, available on the first frame; for everyone else it is `ready`, the
 * reconciliation against Supabase. `useAuthGate` owns which, and the distinction is what
 * keeps a magic-link sign-in working: a link lands on `/#access_token=…&refresh_token=…`,
 * nothing is persisted, and a gate deciding on the spot would redirect to /login and
 * **discard the fragment** — leaving the login page to boot, find no session anywhere, and
 * sit there. So a boot with a callback in the URL waits for `init()` to have read it.
 *
 * **What is not settled renders blank, and deliberately so.** A spinner here needs a minimum
 * time on screen or it flickers, which charges every cold start that minimum whether there
 * was anything to wait for or not. On native nobody sees the window at all: the launch splash
 * is held over it until the app has something to show (see useSplashScreen).
 *
 * Redirects are `replace`, not `push`: a bounced navigation must not leave an entry behind
 * for the back gesture to land on. */
export const ProtectedGate = ({ children }) => {
    const { settled: answered, loggedIn } = useAuthGate()
    const mounted = useMounted()
    const router = useRouter()

    const settled = mounted && answered

    useEffect(() => {
        if (settled && !loggedIn) router.replace(ROUTES.PUBLIC.LOGIN)
    }, [settled, loggedIn, router])

    return settled && loggedIn ? children : null
}

/* The mirror image: keeps a signed-in user off the login page.
 *
 * A viewer arriving on /login with a live session — a bookmarked link, or the magic-link
 * callback — must be bounced *into* the app, which is why this waits on the same answer
 * rather than showing the form to anyone whose session has not been ruled out. */
export const PublicGate = ({ children }) => {
    const { settled: answered, loggedIn } = useAuthGate()
    const mounted = useMounted()
    const router = useRouter()

    const settled = mounted && answered

    useEffect(() => {
        if (settled && loggedIn) router.replace(ROUTES.DEFAULT)
    }, [settled, loggedIn, router])

    return settled && !loggedIn ? children : null
}
