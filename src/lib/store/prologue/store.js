import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS } from '@/lib/constants'
import { toErrorList, todayLocal } from '@/lib/utils'

/* The Daily Read — one day of the Prologue, with the day's fasting rule.
 *
 * The one API-backed store with no group in it and no writes at all: a reading is the same
 * text for every parish and nothing on the screen can be liked, commented on or published,
 * so there is no cross-store arrow here and nothing for `patchRow` to do.
 *
 * Holds one day, keyed by the date it was asked for. The reading for a date never changes,
 * so a repeat request for the day already loaded is dropped rather than refetched — which
 * is what makes leaving the page and coming back cost nothing. */

const INIT = {
    ready: false,
    error: { load: false },
    loading: { load: false },

    day: null,
    /* The `YYYY-MM-DD` currently loaded, and the guard against a stale response landing
     * over a newer one. */
    date: null,
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Boot fetch, from `initAuthorizedStores` — the reading is not scoped to the selected
     * group, so it has a request it can make the moment there is a viewer.
     *
     * Preloading a whole screen is worth it here because of what the reading costs: two
     * external services on the request path, where every other surface in the app is one
     * round trip to our own database. Warming it at sign-in is what turns that into a
     * navigation that has already happened, so the skeleton is only ever seen by somebody
     * who cold-loads `/prologue` directly. Reading the clock here is safe where it is not in
     * render — a boot callback runs in the browser, long after hydration. */
    init: async () => get().load(todayLocal()),

    load: async (date) => {
        if (!date) return
        if (get().date === date && get().ready) return

        set(state => {
            state.date = date
            state.day = null
            state.ready = false
            state.error.load = false
            state.loading.load = true
        })

        try {
            const day = await api.get(API_ENDPOINTS.PROLOGUE, { params: { date } })
            set(state => {
                if (state.date !== date) return
                state.day = day
                state.ready = true
            })
        } catch (error) {
            set(state => {
                if (state.date !== date) return
                state.day = null
                state.error.load = toErrorList(error, "Could not load today's reading.")
                /* Resolved on the failure path too, so the skeleton settles onto the error
                 * rather than spinning behind it. */
                state.ready = true
            })
        } finally {
            set(state => {
                if (state.date === date) state.loading.load = false
            })
        }
    },

    /* Re-reads the day already loaded, for the retry on the error state. Clears `ready` so
     * the caller drops back to the skeleton rather than holding a stale failure on screen. */
    refresh: async () => {
        const date = get().date
        if (!date) return
        set(state => { state.ready = false })
        await get().load(date)
    },

    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = { load: false } }),
})))

export default useStore
