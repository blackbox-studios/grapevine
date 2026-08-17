"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useShallow } from 'zustand/react/shallow'

import { OTP_RESEND_SECONDS, ROLE_LEVEL, ROLES } from "@/lib/constants"
import { useNow } from "@/lib/hooks/useNow.hook"
import useAuthStore from "./store"

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
 * optimistic row cannot render a different author than the one that comes back. */
export const useViewerAuthor = () => {
    return useAuthStore(useShallow(state => (
        state.user
            ? {
                  handle: state.user.handle,
                  name: state.user.fullName,
                  avatar: state.user.avatar,
                  verified: state.user.verified,
              }
            : null
    )))
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

/* Boots the auth store. Mounted once by <App/>, which sits in the root layout *outside*
 * both route groups — so the session is resolved no matter which URL the app is opened at.
 *
 * It used to be called only by useLogin, which meant it ran only once the login page had
 * mounted. A cold load of any protected route therefore redirected first and asked
 * afterwards, and a magic-link callback lost its tokens to that redirect. */
export const useAuthInit = () => {
    const init = useAuthStore(state => state.init)
    const router = useRouter()

    useEffect(() => {
        init().finally(() => {
            /* Scrub the magic-link callback out of the address bar.
             *
             * `/auth/v1/verify` hands the session back as `#access_token=…&refresh_token=…`.
             * supabase-js has read it by the time init resolves, but the fragment stays in
             * the URL — and therefore in the address bar, in browser history, and in
             * anything the reader copies or shares from there. A refresh token pasted into
             * a chat is a live credential.
             *
             * **`router.replace`, not `history.replaceState`.** The raw History API looks
             * like the lighter option and does not work here: the App Router caches the URL
             * it booted with, so it restores the fragment on the next render that touches
             * the router — the address bar cleared, then repopulated itself the moment
             * anything was clicked. Going through the router updates its state too, so the
             * change sticks. */
            if (typeof window === "undefined") return

            /* Only on success. A *failed* callback (`#error=…`) must be left alone: the
             * gate is about to redirect to /login, which drops the fragment anyway, and
             * replacing the URL here would race that navigation and win — stranding the
             * viewer on a protected route that renders nothing, because the gate had
             * already decided to send them away. */
            if (!window.location.hash.includes("access_token")) return
            router.replace(window.location.pathname + window.location.search)
        })
    }, [init, router])
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

/* The viewer's groups, and the one the composer publishes into.
 *
 * `primary` is the first group the viewer administers, which for a single-parish
 * deployment is simply their parish. When someone can administer several, this is the
 * value a group picker replaces. */
export const useGroups = () => {
    const user = useAuthStore(state => state.user)

    return useMemo(() => {
        const orgs = user?.orgs ?? []
        return {
            orgs,
            primary: orgs.find(org => org.role === ROLES.ADMIN) ?? orgs[0] ?? null,
            /* A loaded viewer always has at least one group; emptiness is therefore a
             * reliable "not loaded yet" rather than a real empty state. */
            skeleton: !user,
        }
    }, [user])
}
