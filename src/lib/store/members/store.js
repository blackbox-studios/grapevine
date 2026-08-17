import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS } from '@/lib/constants'
import { toErrorList } from '@/lib/utils'

/* A group's roster — the User Management table.
 *
 * Admin-only server-side, which shapes how this store behaves on failure: a 403 here is
 * not an error the viewer can act on, it means they opened a surface they should not have
 * reached, so it resolves to an empty table rather than a toast telling a member off.
 *
 * Keyed by nothing: only one group's roster is on screen at a time, so `orgId` records
 * which one is loaded and a different id simply replaces it. Not paginated — a parish
 * roster is hundreds of rows, not a feed — but it still returns the `{ items, nextCursor }`
 * collection shape, so adding pagination later is a store change and not a contract one. */

const ERROR_INIT = {
    list: false,
}

const LOADING_INIT = {
    list: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    items: [],
    orgId: null,
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Loads a group's roster. Called by the hook with the viewer's primary group, so it
     * re-runs if that resolves after the first render. */
    load: async (orgId) => {
        if (!orgId) return
        /* Already showing this group and not mid-flight: nothing to do. */
        if (get().orgId === orgId && get().ready) return

        set(state => {
            state.orgId = orgId
            state.loading.list = true
        })

        try {
            const { items } = await api.get(API_ENDPOINTS.ORG_MEMBERS(orgId))
            set(state => {
                /* A late response for a group the viewer has already left is discarded. */
                if (state.orgId !== orgId) return
                state.items = items
                state.ready = true
            })
        } catch (error) {
            set(state => {
                if (state.orgId !== orgId) return
                state.items = []
                state.error.list = toErrorList(error, 'Could not load the member list.')
                /* Resolve readiness on the failure path too, or the skeleton spins
                 * forever instead of settling on the empty state. */
                state.ready = true
            })
        } finally {
            set(state => {
                if (state.orgId === orgId) state.loading.list = false
            })
        }
    },

    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
