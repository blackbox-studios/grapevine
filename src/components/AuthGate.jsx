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
 * **ready** — the auth store has finished reconciling that persisted guess against the
 * real Supabase session. Deciding before this is not a cosmetic flicker, it is a bug that
 * makes signing in by link impossible:
 *
 *   1. A magic link lands on `/#access_token=…&refresh_token=…`.
 *   2. The gate sees `loggedIn === false` (nothing persisted yet) and redirects to /login.
 *   3. That navigation **discards the URL fragment**, taking the tokens with it.
 *   4. The login page boots, finds no session anywhere, and sits there.
 *
 * Waiting for `ready` holds the redirect until `init()` has had its chance to read the URL
 * and establish the session.
 *
 * **That window is blank, and deliberately so.** A spinner used to cover it, with a one-second
 * minimum on screen so it could not flicker — which meant every cold start paid a full second
 * whether or not there was anything to wait for, and the session check is usually faster than
 * that. What it bought was a moment of branded loading; what it cost was making the app feel
 * slower than it is, every single time. Rendering nothing lets a fast boot look fast, and a
 * slow one is a blank frame or two rather than a spinner that has to justify its own arrival.
 *
 * Redirects are `replace`, not `push`: a bounced navigation must not leave an entry behind
 * for the back gesture to land on. */
export const ProtectedGate = ({ children }) => {
    const { ready, loggedIn } = useAuthGate()
    const mounted = useMounted()
    const router = useRouter()

    const settled = mounted && ready

    useEffect(() => {
        if (settled && !loggedIn) router.replace(ROUTES.PUBLIC.LOGIN)
    }, [settled, loggedIn, router])

    return settled && loggedIn ? children : null
}

/* The mirror image: keeps a signed-in user off the login page.
 *
 * This one needs `ready` for its own reason. A viewer arriving on /login with a live
 * session — a bookmarked link, or the magic-link callback — must be bounced *into* the app,
 * and that can only be known once the session check has run. */
export const PublicGate = ({ children }) => {
    const { ready, loggedIn } = useAuthGate()
    const mounted = useMounted()
    const router = useRouter()

    const settled = mounted && ready

    useEffect(() => {
        if (settled && loggedIn) router.replace(ROUTES.DEFAULT)
    }, [settled, loggedIn, router])

    return settled && !loggedIn ? children : null
}
