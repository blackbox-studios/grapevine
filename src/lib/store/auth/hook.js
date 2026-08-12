"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useShallow } from 'zustand/react/shallow'

import useAuthStore from "./store"

/* Loads the full list of app users for the User Management table. */
export const useAdmin = () => {
    const [users, init] = useAuthStore(useShallow(state => ([
        state.users,
        state.init,
    ])))

    useEffect(() => {
        init()
    }, [init])

    /* A loaded users list is never empty, so emptiness is a reliable "not loaded
     * yet" signal — the skeleton paints on the first frame and clears once the list
     * arrives (a background refresh keeps it populated, so it never re-flashes). */
    const skeleton = users.length === 0

    return useMemo(() => ({
        users,
        skeleton,
    }), [users, skeleton])
}

export const useLogin = () => {
    const [loginUser, loading, loggedIn, init, error, clearError] = useAuthStore(useShallow(state => ([
        state.login,
        state.loading.login,
        state.loggedIn,
        state.init,
        state.error.login,
        state.clearError,
    ])))
    const router = useRouter()

    /* Hand the Next router to the store action, which redirects after signing in.
     * Middleware keeps unauthenticated users out. */
    const login = useCallback(async (email, password) => {
        await loginUser(email, password, router)
    }, [loginUser, router])

    useEffect(() => {
        init()
    }, [init])

    return useMemo(() => ({
        login,
        loading,
        loggedIn,
        error,
        clearError: () => clearError("login"),
    }), [login, loading, loggedIn, error, clearError])
}

export const useLogout = () => {
    const logoutUser = useAuthStore(state => state.logout)
    const router = useRouter()

    const logout = useCallback(() => {
        logoutUser(router)
    }, [logoutUser, router])

    return useMemo(() => ({ logout }), [logout])
}

export const useUser = () => {
    return useAuthStore(state => state.user)
}

/* Whether anyone is signed in — the single fact the route gates need, kept separate from
 * useLogin so mounting a gate doesn't drag in the login form's loading/error surface.
 * Read by <ProtectedGate/> / <PublicGate/> (see components/AuthGate.jsx). */
export const useAuthed = () => {
    return useAuthStore(state => state.loggedIn)
}
