"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useUser as useAuth0User } from "@auth0/nextjs-auth0"
import { useShallow } from 'zustand/react/shallow'

import { useDelay } from "@/lib/hooks/useDebounce.hook"
import useAuthStore from "./store"

/* Loads the full list of app users for the User Management table. */
export const useAdmin = () => {
    const [users, loadingUsers, loggedIn, init] = useAuthStore(useShallow(state => ([
        state.users,
        state.loading.users,
        state.loggedIn,
        state.init,
    ])))

    useEffect(() => {
        if (loggedIn) init()
    }, [loggedIn, init])

    const skeleton = useDelay(useMemo(() => loadingUsers && users.length === 0, [loadingUsers, users]))

    return useMemo(() => ({
        users,
        skeleton,
    }), [users, skeleton])
}

/* Mirrors the Auth0 session (SDK useUser) into the store. Mounted once by App.jsx. */
export const useSession = () => {
    const setSession = useAuthStore(state => state.setSession)
    const { user } = useAuth0User()

    useEffect(() => {
        setSession(user ?? null)
    }, [user, setSession])
}

/* Kicks off Auth0 login (navigation lives in store.login). */
export const useLogin = () => {
    const [loginUser, loading, loggedIn] = useAuthStore(useShallow(state => ([
        state.login,
        state.loading.login,
        state.loggedIn,
    ])))

    const login = useCallback((email) => loginUser(email), [loginUser])

    return useMemo(() => ({
        login,
        loading,
        loggedIn,
    }), [login, loading, loggedIn])
}

/* Ends the Auth0 session (reset + navigation live in store.logout). */
export const useLogout = () => {
    const logoutUser = useAuthStore(state => state.logout)

    const logout = useCallback(() => logoutUser(), [logoutUser])

    return useMemo(() => ({ logout }), [logout])
}

export const useUser = () => {
    return useAuthStore(state => state.user)
}
