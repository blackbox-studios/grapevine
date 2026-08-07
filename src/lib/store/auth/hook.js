"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useShallow } from 'zustand/react/shallow'

import { useDelay } from "@/lib/hooks/useDebounce.hook"
import useAuthStore from "./store"

/* Loads the full list of app users for the User Management table. */
export const useAdmin = () => {
    const [users, loadingUsers, init] = useAuthStore(useShallow(state => ([
        state.users,
        state.loading.users,
        state.init,
    ])))

    useEffect(() => {
        init()
    }, [init])

    const skeleton = useDelay(useMemo(() => loadingUsers && users.length === 0, [loadingUsers, users]))

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
