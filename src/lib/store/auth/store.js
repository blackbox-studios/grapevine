import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { ROUTES } from '@/lib/constants'
import { CURRENT_USER, USERS } from '@/lib/metadata'
import { mockDelay } from '@/lib/mock'
import useGlobalStore from '@/lib/store/global.store'

/* `loggedIn` here (persisted to localStorage) is the whole auth state, and the route
 * gates in components/AuthGate.jsx read it directly. There is no companion cookie: the
 * app ships as a static export, so there is no middleware to serve one — see
 * .claude/skills/develop/auth-architecture.md for how a real provider slots in.
 *
 * TEMPORARY: this is a mock. Any credentials sign you in. */

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
                        router.replace(ROUTES.DEFAULT)
                        await get()._fetchUsers()
                    } finally {
                        set(state => { state.loading.login = false })
                    }
                },
                logout: async (router) => {
                    set(state => { state.loading.logout = true })
                    try {
                        await mockDelay(200)
                    } finally {
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
                name: 'synaxis-user',
            },
        ),
    ),
)

export default useStore
