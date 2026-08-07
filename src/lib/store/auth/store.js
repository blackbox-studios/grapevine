import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { ROUTES } from '@/lib/constants'
import { CURRENT_USER, USERS } from '@/lib/metadata'
import { mockDelay } from '@/lib/mock'
import useGlobalStore from '@/lib/store/global.store'

/* Mirror the mock login state into a cookie so the Next middleware (which can't read
 * localStorage) can gate protected/public routes on the server. Written alongside the
 * persisted store state on login, cleared on logout.
 *
 * TEMPORARY: this manual, client-set cookie is a stand-in for real auth. When you
 * integrate a real provider, the session cookie should be an HTTP-only cookie set by
 * the server (the login response / token exchange), not written here via
 * document.cookie — at which point setAuthCookie/clearAuthCookie go away and
 * middleware.js reads the real session cookie instead. */
const AUTH_COOKIE = 'scrolls-auth'
const setAuthCookie = () => {
    if (typeof document !== 'undefined') {
        document.cookie = `${AUTH_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
    }
}
const clearAuthCookie = () => {
    if (typeof document !== 'undefined') {
        document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; samesite=lax`
    }
}

const ERROR_INIT = {
    login: false,
    logout: false,
}

const LOADING_INIT = {
    login: false,
    logout: false,
    users: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    loggedIn: false,
    user: null,

    /* All app users. Populated on first login. */
    users: [],
}

const useStore = create(
    immer(
        persist(
            (set, get) => ({
                ...INIT,
                /* Boot-time hydration. `persist` restores `loggedIn`/`user` from
                 * localStorage; if the user was already logged in from a previous
                 * session we still repopulate the users list (which is not
                 * persisted). Fresh visitors start logged out. */
                init: async () => {
                    if (get().ready === true) return
                    if (get().loggedIn) {
                        /* Re-sync from the current seed so metadata edits (name,
                         * email, role) show up even for sessions that already
                         * persisted an older `user` object to localStorage. */
                        set(state => { state.user = CURRENT_USER })
                        await get()._fetchUsers()
                    }
                    set(state => { state.ready = true })
                },
                login: async (_email, _password, router) => {
                    set(state => { state.loading.login = true })
                    try {
                        /* Any credentials work in demo mode — this is where a real
                         * app would POST to /auth/login. The whole gate is just
                         * `loggedIn = true`; swap this block for a real request when
                         * you wire a backend. */
                        await mockDelay()
                        set(state => {
                            state.loggedIn = true
                            state.user = CURRENT_USER
                            state.error.login = false
                        })
                        setAuthCookie()
                        await get()._fetchUsers()
                        router.replace(ROUTES.DEFAULT)
                    } finally {
                        set(state => { state.loading.login = false })
                    }
                },
                logout: async (router) => {
                    set(state => { state.loading.logout = true })
                    try {
                        await mockDelay(200)
                    } finally {
                        clearAuthCookie()
                        useGlobalStore.getState().reset()
                        set(state => {
                            state.ready = true
                            state.loading.logout = false
                        })
                        router.replace(ROUTES.PUBLIC.LOGIN)
                    }
                },
                _fetchUsers: async () => {
                    set(state => { state.loading.users = true })
                    try {
                        await mockDelay()
                        set(state => { state.users = USERS })
                    } finally {
                        set(state => { state.loading.users = false })
                    }
                },
                reset: () => set(() => ({ ...INIT })),
                clearError: (key) => set(state => { state.error[key] = false }),
                clearErrors: () => set(state => { state.error = ERROR_INIT }),
            }),
            {
                partialize: (state) => ({
                    loggedIn: state.loggedIn,
                    user: state.user,
                }),
                name: 'scrolls-user',
            },
        ),
    ),
)

export default useStore
