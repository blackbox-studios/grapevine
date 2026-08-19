import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS, ERROR_CODES } from '@/lib/constants'
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
    invite: false,
    update: false,
}

const LOADING_INIT = {
    list: false,
    invite: false,
    /* Keyed by membership id, so one row's spinner does not disable the whole table. */
    update: {},
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

    /* Loads a group's roster. Called by the hook with the selected group, so it re-runs
     * when the switcher moves and when the selection resolves after the first render. */
    load: async (orgId) => {
        if (!orgId) return
        /* Already showing this group and not mid-flight: nothing to do. */
        if (get().orgId === orgId && get().ready) return

        /* A different group is a different roster, so the old rows go now rather than when
         * the request lands — otherwise one parish's members sit under another parish's
         * heading, and every row's actions would write to the wrong membership if tapped. */
        set(state => {
            state.orgId = orgId
            state.items = []
            state.ready = false
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
                /* A refusal is silent. It means the viewer reached a surface they should
                 * not have, which the route gate is already handling by redirecting them —
                 * so toasting as well tells a member off for a navigation they did not
                 * choose, on a page disappearing underneath the toast. The hook does not
                 * send this request for a non-admin at all; this is the backstop for the
                 * case it cannot cover, an admin demoted mid-session. */
                if (error?.code !== ERROR_CODES.PERMISSION_DENIED) {
                    state.error.list = toErrorList(error, 'Could not load the member list.')
                }
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

    /* Admits one or more people. The server takes a pasted blob and splits it, so the
     * whole textarea goes over as-is rather than being parsed here.
     *
     * The roster is refetched rather than patched from the response: an admission can
     * create a person, restore a revoked one, or re-rank an existing one, and reconciling
     * three shapes into the list by hand is more code and more ways to be wrong than one
     * read. Returns the report so the caller can say what happened per address. */
    invite: async ({ emails, role, vocation }) => {
        const orgId = get().orgId
        if (!orgId) return null

        set(state => {
            state.loading.invite = true
            state.error.invite = false
        })
        try {
            const result = await api.post(API_ENDPOINTS.ORG_INVITES(orgId), {
                emails,
                role,
                vocation,
            })
            await get().refresh()
            return result
        } catch (error) {
            set(state => {
                state.error.invite = toErrorList(error, 'Could not add those people.')
            })
            return null
        } finally {
            set(state => { state.loading.invite = false })
        }
    },

    /* Approve, revoke, or re-rank one member.
     *
     * Optimistic would be the wrong call here: these are consequential, low-frequency
     * administrative actions where being told the truth matters more than the row moving
     * instantly, and a revoke that silently failed while appearing to succeed is exactly
     * the bug worth avoiding. The row shows a spinner and takes the server's answer. */
    updateMember: async (membershipId, patch) => {
        set(state => { state.loading.update[membershipId] = true })
        try {
            const member = await api.patch(API_ENDPOINTS.MEMBERSHIP(membershipId), patch)
            set(state => {
                const index = state.items.findIndex(item => item.membershipId === membershipId)
                if (index !== -1) state.items[index] = member
            })
            return member
        } catch (error) {
            set(state => {
                state.error.update = toErrorList(error, 'Could not update that member.')
            })
            return null
        } finally {
            set(state => { delete state.loading.update[membershipId] })
        }
    },

    /* Re-reads the roster for the group already loaded. */
    refresh: async () => {
        const orgId = get().orgId
        if (!orgId) return
        try {
            const { items } = await api.get(API_ENDPOINTS.ORG_MEMBERS(orgId))
            set(state => { state.items = items })
        } catch (error) {
            set(state => {
                state.error.list = toErrorList(error, 'Could not refresh the member list.')
            })
        }
    },

    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
