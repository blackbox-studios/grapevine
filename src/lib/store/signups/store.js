import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS, ERROR_CODES, PAGE_SIZE } from '@/lib/constants'
import { toErrorList } from '@/lib/utils'

/* A group's sign-up sheets, and what this person has already put their name to.
 *
 * ── The list half of the list/detail split ───────────────────────────────────
 *
 * This owns the rows; `lib/store/sheet` owns the one that is open and every write to a slot
 * inside it — the same split as `feed` and `post`, for the same reasons. A row here is a
 * *summary*: how many dates are still to come, how many still need somebody, how many the
 * viewer is standing for. That is everything a collapsed accordion has to say, and it is
 * deliberately not the slots themselves, which arrive only when a sheet is opened.
 *
 * The arrow runs one way. `sheet` reaches in here through two narrow actions —
 * `applySlot` and `replaceSheet` — and this store imports nothing from it. Two stores that
 * import each other means neither owns the entity.
 *
 * ── A row is a rota *with its dates* ────────────────────────────────────────
 *
 * The endpoint ships every sheet's slots, so a row here is the whole rota rather than a summary
 * of one. Two things follow, and both are simplifications rather than costs:
 *
 *  - **Opening a row is not a request.** The `sheet` store promotes the loaded rota
 *    synchronously and refreshes behind it, the way `post` promotes the feed's cached row.
 *  - **Nothing here is a tally.** "4 dates need people" and "what have I signed up for" are
 *    both counted off the slots in hand (`summarize`), so a claim moves them by replacing one
 *    slot rather than by patching four numbers with a delta — and there is no second copy of
 *    the arithmetic to drift from the first.
 *
 * ── The surface's own chrome lives here too ─────────────────────────────────
 *
 * `tab` and `mode` are which half of `/events` is showing and whether an admin is reading or
 * editing. They sit in a store rather than in the page because three things outside it set
 * them: a tapped reminder and a tapped push banner both open the sign-ups tab, and the group
 * tree's Manage events row opens it in edit mode. That is the same argument `profile.openHandle`
 * makes — state several subtrees have to agree on is not component state.
 */

const ERROR_INIT = {
    list: false,
    write: false,
}

const LOADING_INIT = {
    list: false,
    more: false,
    write: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    orgId: null,
    items: [],
    cursor: null,
    hasMore: true,

    /* Which half of the Events page is showing. The calendar leads: it is the tab worth opening
     * when nothing is being asked of you. */
    tab: 'calendar',

    /* Whether an admin is reading this surface or administering it. Members never see the
     * switch and the server never trusts it — `requireMembership(..., { role: "ADMIN" })` is
     * what actually refuses a write. */
    mode: 'view',
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Loads a group's sheets. Takes the group as an argument and discards a response for one
     * the viewer has since left — the org-scoped store pattern, see `lib/store/org/store.js`. */
    load: async (orgId) => {
        if (!orgId) return
        /* Already loaded, or already asking — the same guard the calendar store carries, and
         * for the same reason: a hook effect can re-run before a response lands. */
        if (get().orgId === orgId && (get().ready || get().loading.list)) return

        set(state => {
            /* Emptied on a switch rather than merely refetched: one parish's rotas under
             * another parish's name is wrong, and every Take button on them would write to a
             * group the viewer is not looking at. */
            state.orgId = orgId
            state.items = []
            state.cursor = null
            state.hasMore = true
            state.ready = false
            state.loading.list = true
        })

        try {
            const { items, nextCursor } = await api.get(API_ENDPOINTS.SIGNUPS, {
                params: { orgId, limit: PAGE_SIZE.SIGNUPS },
            })
            set(state => {
                if (state.orgId !== orgId) return
                state.items = items
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
                state.ready = true
            })
        } catch (error) {
            set(state => {
                if (state.orgId !== orgId) return
                state.items = []
                /* Silent on a refusal, matching the roster: it means the viewer reached a
                 * surface they should not have, which the gate is already handling — telling
                 * them off as well is a toast over a page that is disappearing. */
                if (error?.code !== ERROR_CODES.PERMISSION_DENIED) {
                    state.error.list = toErrorList(error, 'Could not load the sign-up sheets.')
                }
                state.ready = true
            })
        } finally {
            set(state => {
                if (state.orgId === orgId) state.loading.list = false
            })
        }
    },

    loadMore: async () => {
        const { orgId, cursor, hasMore, loading } = get()
        if (!orgId || !hasMore || !cursor || loading.more || loading.list) return

        set(state => { state.loading.more = true })
        try {
            const { items, nextCursor } = await api.get(API_ENDPOINTS.SIGNUPS, {
                params: { orgId, limit: PAGE_SIZE.SIGNUPS, cursor },
            })
            set(state => {
                if (state.orgId !== orgId) return
                /* A refresh can land mid-append, so ids already held are filtered out. */
                const seen = new Set(state.items.map(item => item.id))
                state.items.push(...items.filter(item => !seen.has(item.id)))
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
            })
        } catch (error) {
            set(state => { state.error.list = toErrorList(error, 'Could not load more sheets.') })
        } finally {
            set(state => { state.loading.more = false })
        }
    },

    refresh: async () => {
        const orgId = get().orgId
        if (!orgId) return
        try {
            const { items, nextCursor } = await api.get(API_ENDPOINTS.SIGNUPS, {
                params: { orgId, limit: PAGE_SIZE.SIGNUPS },
            })
            set(state => {
                if (state.orgId !== orgId) return
                state.items = items
                state.cursor = nextCursor
                state.hasMore = nextCursor !== null
            })
        } catch (error) {
            set(state => {
                state.error.list = toErrorList(error, 'Could not refresh the sign-up sheets.')
            })
        }
    },

    /* Publishes a rota. Admin-only server-side; the surface is gated too.
     *
     * **Not optimistic**, and nothing administrative here is — the same call `members` makes.
     * The dates are generated by the server from the schedule, so there is nothing the client
     * could put on screen ahead of the response that would not then be replaced by different
     * rows. The form shows a ripple and takes the server's answer. */
    createSheet: async (input) => {
        set(state => {
            state.loading.write = true
            state.error.write = false
        })
        try {
            const sheet = await api.post(API_ENDPOINTS.SIGNUPS, input)
            set(state => {
                /* Newest first, which is the order the list is already in. */
                state.items.unshift(sheet)
            })
            return sheet
        } catch (error) {
            set(state => {
                state.error.write = toErrorList(error, 'Could not create that sign-up sheet.')
            })
            return null
        } finally {
            set(state => { state.loading.write = false })
        }
    },

    /* Retires a rota. Soft on the server, so this is a removal from the list rather than a
     * deletion of anything — a mis-tap costs the parish nothing that cannot be restored from
     * the database. */
    removeSheet: async (sheetId) => {
        set(state => {
            state.loading.write = true
            state.error.write = false
        })
        try {
            await api.delete(API_ENDPOINTS.SIGNUP(sheetId))
            set(state => {
                state.items = state.items.filter(item => item.id !== sheetId)
            })
            return true
        } catch (error) {
            set(state => {
                state.error.write = toErrorList(error, 'Could not remove that sign-up sheet.')
            })
            return false
        } finally {
            set(state => { state.loading.write = false })
        }
    },

    /* ── The surface area the `sheet` store has to this one ─────────────────── */

    /* The loaded rota with this id, or null — the fast path a row is opened through, exactly as
     * `feed.cachedPost` is for an opened post. */
    cachedSheet: (sheetId) => get().items.find(item => item.id === sheetId) ?? null,

    /* Swaps a row for the server's version of it, after an edit made in the open sheet. */
    replaceSheet: (sheet) => set(state => {
        const index = state.items.findIndex(item => item.id === sheet.id)
        if (index !== -1) state.items[index] = { ...state.items[index], ...sheet }
    }),

    /* Applies one authoritative slot to the rota that holds it.
     *
     * **The only write the list needs, because nothing here is a tally.** Every number a row
     * shows is counted off its own slots at render, so replacing the slot is the whole update —
     * there is no summary to move by a delta, and no way for a count to disagree with the dates
     * it is a count of. The strip of the viewer's own dates falls out of the same slots.
     *
     * Keyed by the slot's own `sheetId`, so this works for a slot claimed from the calendar with
     * no rota open at all. */
    applySlot: (slot) => set(state => {
        const row = state.items.find(item => item.id === slot.sheetId)
        if (!row) return
        const index = row.slots.findIndex(existing => existing.id === slot.id)
        if (index !== -1) row.slots[index] = slot
    }),

    /* Drops a date from its rota — an admin removing one nobody had taken. */
    removeSlot: (sheetId, slotId) => set(state => {
        const row = state.items.find(item => item.id === sheetId)
        if (row) row.slots = row.slots.filter(slot => slot.id !== slotId)
    }),

    /* ── The surface's chrome ───────────────────────────────────────────────── */

    setTab: (tab) => set(state => { state.tab = tab }),

    setMode: (mode) => set(state => { state.mode = mode }),

    /* What the group tree's Manage events row does: open the rotas, ready to edit. One action
     * rather than two calls at the call site, so the entrance cannot set half of it. */
    manage: () => set(state => {
        state.tab = 'signups'
        state.mode = 'edit'
    }),

    /* Nothing to boot until a group resolves — the hook's effect is what loads this. */
    init: async () => {},

    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
