import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { ROUTES } from '@/lib/constants'
import { USERS } from '@/lib/metadata'
import { mockDelay } from '@/lib/mock'
import useGlobalStore from '@/lib/store/global.store'

/* Auth is owned by Auth0. This store mirrors the raw Auth0 profile as `user`
 * (OIDC fields: sub, name, email, …) plus `loggedIn`, drives login/logout, and
 * holds the mock User Management list. Not persisted — reflects the live session. */

const ERROR_INIT = {
    login: false,
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

    /* All users of Ozora, for the User Management table. Mock data, loaded on
     * demand by the admin page (see useAdmin). */
    users: [],
}

const useStore = create(
    immer((set, get) => ({
        ...INIT,
        /* Mirror the Auth0 session in (from useSession). Raw profile, or null. */
        setSession: (profile) => {
            set(state => {
                state.loggedIn = Boolean(profile)
                state.user = profile ?? null
                state.ready = true
            })
        },
        /* Start Auth0 login. `login_hint` pre-fills the email (identifier-first).
         * Full-document navigation, NOT router.push — /auth/login redirects
         * cross-origin to Auth0, which router.push's RSC fetch hits CORS on. */
        login: (email) => {
            set(state => { state.loading.login = true })
            const params = new URLSearchParams({ returnTo: ROUTES.DEFAULT })
            if (email) params.set('login_hint', email)
            window.location.assign(`/auth/login?${params.toString()}`)
        },
        /* End the Auth0 session (full-document navigation, per login). */
        logout: () => {
            useGlobalStore.getState().reset()
            set(state => { state.loading.logout = true })
            window.location.assign('/auth/logout')
        },
        /* Ensure the mock users list is loaded (used by the admin table). */
        init: async () => {
            if (get().loggedIn && get().users.length === 0 && !get().loading.users) {
                await get()._fetchUsers()
            }
            set(state => { state.ready = true })
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
    })),
)

export default useStore
