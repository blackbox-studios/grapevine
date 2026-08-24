"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useShallow } from 'zustand/react/shallow'

import { ACCESS, OTP_RESEND_SECONDS, ROLE_LEVEL, ROLES, ROUTES } from "@/lib/constants"
import { useNow } from "@/lib/hooks/useNow.hook"
import { isNative, onAppState } from "@/lib/native"
import useAuthStore, { viewerAuthor } from "./store"

/* The login form's whole surface: request a code, then verify it.
 *
 * Two steps, one hook, because they are one flow and the second needs the address the
 * first used — which the store holds as `pendingEmail`, so the form never has to carry it
 * across a re-render or a remount. `stage` is derived from that rather than being a
 * separate piece of state, so the two can't disagree. */
export const useLogin = () => {
    const [
        requestCode,
        verifyCode,
        cancelCode,
        pendingEmail,
        codeSentAt,
        loadingRequest,
        loadingVerify,
        errorRequest,
        errorVerify,
        loggedIn,
        init,
        clearError,
    ] = useAuthStore(useShallow(state => ([
        state.requestCode,
        state.verifyCode,
        state.cancelCode,
        state.pendingEmail,
        state.codeSentAt,
        state.loading.request,
        state.loading.verify,
        state.error.request,
        state.error.verify,
        state.loggedIn,
        state.init,
        state.clearError,
    ])))
    const router = useRouter()

    /* Ticks every second so the resend countdown actually counts down. Cheap, and only
     * while the login screen is mounted. */
    const now = useNow(1000)

    useEffect(() => {
        init()
    }, [init])

    /* The router is handed to the store action, which redirects after the session and the
     * profile are both in place — keeping the navigation next to the state change that
     * justifies it. */
    const verify = useCallback(
        (code) => verifyCode(code, router),
        [verifyCode, router],
    )

    /* Re-sends to the address already awaiting a code. */
    const resend = useCallback(
        () => requestCode(pendingEmail),
        [requestCode, pendingEmail],
    )

    /* Seconds left before Supabase will accept another code for this address. It enforces
     * one OTP request per user per 60 seconds, so resending inside that window is a
     * guaranteed failure — the button waits it out instead of surfacing an error the user
     * can do nothing about. */
    const resendIn = useMemo(() => {
        if (!codeSentAt) return 0
        const elapsed = Math.floor((now - codeSentAt) / 1000)
        return Math.max(0, OTP_RESEND_SECONDS - elapsed)
    }, [codeSentAt, now])

    return useMemo(() => ({
        stage: pendingEmail ? "code" : "email",
        email: pendingEmail,
        requestCode,
        verify,
        resend,
        resendIn,
        back: cancelCode,
        loading: loadingRequest || loadingVerify,
        error: errorRequest || errorVerify,
        loggedIn,
        clearError: () => {
            clearError("request")
            clearError("verify")
        },
    }), [
        pendingEmail, requestCode, verify, resend, resendIn, cancelCode,
        loadingRequest, loadingVerify, errorRequest, errorVerify, loggedIn, clearError,
    ])
}

/* Orientation: submit the answers, and the viewer comes back onboarded.
 *
 * The updated viewer replaces the store's copy directly rather than triggering a re-fetch
 * — `onboardedAt` is what the gate reads, so any gap between "saved" and "the client knows
 * it saved" is a gap where the viewer sits on a completed form. */
export const useOnboarding = () => {
    const [user, completeOnboarding, checkHandle, loading, error, clearError] = useAuthStore(
        useShallow(state => ([
            state.user,
            state.completeOnboarding,
            state.checkHandle,
            state.loading.onboarding,
            state.error.onboarding,
            state.clearError,
        ])),
    )
    const router = useRouter()

    const submit = useCallback(
        (values) => completeOnboarding(values, router),
        [completeOnboarding, router],
    )

    return useMemo(() => ({
        user,
        submit,
        /* Passed straight through. The result is per-keystroke and belongs to the step that
         * asked, so it is held there in local state rather than in the store. */
        checkHandle,
        loading,
        error,
        clearError: () => clearError("onboarding"),
    }), [user, submit, checkHandle, loading, error, clearError])
}

export const useLogout = () => {
    const logoutUser = useAuthStore(state => state.logout)
    const router = useRouter()

    const logout = useCallback(() => {
        logoutUser(router)
    }, [logoutUser, router])

    return useMemo(() => ({ logout }), [logout])
}

/* The signed-in viewer: profile, vocation, role, and groups. Null when signed out. */
export const useUser = () => {
    return useAuthStore(state => state.user)
}

/* The viewer's identity as a post/comment author — the shape the API stamps on the server.
 *
 * Used for the optimistic comment row, which has to render before the server has replied
 * with the authoritative resource. Built here so the projection lives in one place and the
 * optimistic row cannot render a different author than the one that comes back.
 *
 * The shape itself is `viewerAuthor` in the store, shared with the comments store, which
 * needs the same projection from a layer where no hook is available. */
export const useViewerAuthor = () => {
    return useAuthStore(useShallow(state => viewerAuthor(state.user)))
}

/* Whether anyone is signed in. Kept separate from useLogin so a consumer doesn't drag in
 * the login form's loading/error surface. */
export const useAuthed = () => {
    return useAuthStore(state => state.loggedIn)
}

/* What the route gates need: whether the session question has been *answered*, and what
 * the answer is.
 *
 * Both halves matter. `loggedIn` alone is the persisted guess, and acting on it before
 * `ready` makes the gate redirect out of a magic-link callback before the tokens in the
 * URL have been read — see the header of components/AuthGate.jsx. */
export const useAuthGate = () => {
    return useAuthStore(useShallow(state => ({
        ready: state.ready,
        loggedIn: state.loggedIn,
    })))
}

/* Where a signed-in viewer belongs, as a route — or `null` for "the app", or `undefined`
 * for "not known yet".
 *
 * Three-valued on purpose. A gate that cannot tell "no redirect needed" from "the viewer
 * has not loaded" will bounce someone out of the app for the fraction of a second before
 * /api/me answers, and on a magic-link boot that is long enough to matter.
 *
 * This is the single source that both gates in components/MemberGate.jsx and the callback
 * scrub in useAuthInit read, so they cannot disagree and fight over the same navigation. */
export const useGatewayDestination = () => {
    return useAuthStore(state => {
        if (!state.ready || !state.loggedIn) return undefined
        if (!state.user) return undefined
        if (state.user.access !== ACCESS.ACTIVE) return ROUTES.ACCESS
        if (!state.user.onboardedAt) return ROUTES.WELCOME
        return null
    })
}

/* Keeps the session alive across the gaps when the app isn't running.
 *
 * A session does not usually die because it expired; it dies because nothing was awake to
 * renew it. A phone spends most of its life with this app suspended, its timers frozen and
 * its access token quietly ageing out, and the moment the reader taps the icon the first
 * request goes out on a token that expired in the night. So the shell tells the store when
 * it wakes, and the store renews before anything is asked of the API.
 *
 * Three signals, because no one of them covers the ground:
 *
 *   appStateChange   native, and the authoritative one — the OS saying the app is back.
 *   online           either target regaining a connection, which is when a viewer left on
 *                    a cached profile can finally be confirmed.
 *   visibilitychange web only. On native supabase-js's own visibility handling has already
 *                    been taken over (see `startAutoRefresh`), and doubling it up here
 *                    would just fire a second refresh at every wake.
 *
 * All three land on the same idempotent `resume()`, so overlapping wakes cost nothing. */
const useSessionResume = () => {
    const [resume, suspend] = useAuthStore(
        useShallow((state) => [state.resume, state.suspend]),
    )

    useEffect(() => {
        const offAppState = onAppState((active) => (active ? resume() : suspend()))

        const onOnline = () => resume()
        window.addEventListener("online", onOnline)

        const onVisible = () => {
            if (document.visibilityState === "visible") resume()
        }
        if (!isNative()) document.addEventListener("visibilitychange", onVisible)

        return () => {
            offAppState()
            window.removeEventListener("online", onOnline)
            document.removeEventListener("visibilitychange", onVisible)
        }
    }, [resume, suspend])
}

/* Boots the auth store. Mounted once by <App/>, which sits in the root layout *outside*
 * both route groups — so the session is resolved no matter which URL the app is opened at.
 *
 * It used to be called only by useLogin, which meant it ran only once the login page had
 * mounted. A cold load of any protected route therefore redirected first and asked
 * afterwards, and a magic-link callback lost its tokens to that redirect. */
export const useAuthInit = () => {
    const init = useAuthStore(state => state.init)
    const destination = useGatewayDestination()
    const router = useRouter()

    useEffect(() => {
        init()
    }, [init])

    useSessionResume()

    /* Scrub the magic-link callback out of the address bar.
     *
     * `/auth/v1/verify` hands the session back as `#access_token=…&refresh_token=…`.
     * supabase-js has read it by the time the session resolves, but the fragment stays in
     * the URL — and therefore in the address bar, in browser history, and in anything the
     * reader copies. A refresh token pasted into a chat is a live credential.
     *
     * **Only when nobody else is navigating.** This is gated on `destination === null`
     * ("the viewer stays where they are") because the gates in components/MemberGate.jsx
     * may be about to send them to /welcome or /access — and those navigations drop the
     * fragment for free. Scrubbing unconditionally means two `router.replace` calls racing
     * for the same tick: this one lands last, cancels the gate's redirect, and leaves the
     * viewer on a route the gate has already decided to render nothing for. That is a
     * blank page, and it is exactly what happened before this guard existed.
     *
     * `router.replace`, not `history.replaceState`: the App Router caches the URL it
     * booted with and restores the fragment on the next render that touches the router. */
    useEffect(() => {
        if (destination !== null) return
        if (typeof window === "undefined") return
        if (!window.location.hash.includes("access_token")) return
        router.replace(window.location.pathname + window.location.search)
    }, [destination, router])
}

/* The viewer's role in a given group, or in their primary group when no id is passed.
 *
 * Roles are per-group, so this always resolves against one: being an admin of a parish
 * grants nothing in another parish, and a hook that returned a single global "am I admin"
 * would quietly paper over that the moment a second group exists. */
export const useRole = (orgId) => {
    return useAuthStore(state => {
        if (!state.user) return null
        if (!orgId) return state.user.role
        return state.user.orgs?.find(org => org.id === orgId)?.role ?? null
    })
}

/* Whether the viewer meets or exceeds `role` in the given group. The comparison is
 * hierarchical via ROLE_LEVEL, so a control requiring MEMBER is satisfied by an ADMIN. */
export const usePrivileged = (role = ROLES.ADMIN, orgId) => {
    const current = useRole(orgId)
    return useMemo(() => {
        if (!current) return false
        return (ROLE_LEVEL[current] ?? 0) >= (ROLE_LEVEL[role] ?? 0)
    }, [current, role])
}

/* Whether the viewer meets `role` in **any** group they belong to.
 *
 * A different question from `usePrivileged`, not a convenience over it, and the two must not
 * be confused. That one answers "may I act *here*", which is what every control inside a
 * group asks. This answers "does this capability exist for me at all", which is what an
 * entrance asks — the compose button lives in the app's chrome, above the group switcher, and
 * an admin of one parish reading their diocese should still see it. What they then post
 * *into* is the composer's own question, and it is asked again per group at publish time.
 *
 * Reach for this only for an affordance that is genuinely outside a group's scope. Anything
 * rendered within one wants `usePrivileged(role, orgId)`. */
export const usePrivilegedAnywhere = (role = ROLES.ADMIN) => {
    return useAuthStore(state =>
        (state.user?.orgs ?? []).some(
            org => (ROLE_LEVEL[org.role] ?? 0) >= (ROLE_LEVEL[role] ?? 0),
        ),
    )
}
