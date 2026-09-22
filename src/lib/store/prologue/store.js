import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS, DEFAULT_TRANSLATION } from '@/lib/constants'
import { addDays, toErrorList, todayLocal } from '@/lib/utils'

/* The Daily Read — a day of the Prologue, with that day's fasting rule.
 *
 * The one API-backed store with no group in it and no writes at all: a reading is the same
 * text for every parish and nothing on the screen can be liked, commented on or published,
 * so there is no cross-store arrow here and nothing for `patchPost` to do.
 *
 * **Keyed by date, and it keeps what it has read.** A reading for a given date never changes,
 * so a day once fetched is answered from memory forever after — which is what lets the
 * stepper move between days without a skeleton, and what makes leaving the screen and coming
 * back cost nothing. The cache cannot grow: the stepper reaches one day either side of today
 * and nothing else can ask for a date, so it holds three entries.
 *
 * **The one thing that can invalidate it is the reader's translation**, since the scripture
 * above the Prologue is printed in it. This store holds the translation its days were fetched
 * in and drops them when `init` is handed a different one — the same shape `feed` uses for the
 * selected group, and the reason the preference lives in `prefs` and is passed in rather than
 * reached for. */

/* How far either side of today the reader may step. The commemoration changes at vespers, so
 * somebody reading on a September evening is often looking for the 3rd rather than the 2nd —
 * one day forward covers that, and one day back covers having missed yesterday. Wider than
 * that is a calendar, which is a different screen. */
export const DAY_REACH = 1

const INIT = {
    ready: false,
    error: { load: false },
    loading: { load: false },

    /* Readings by `YYYY-MM-DD`. */
    days: {},
    /* The date being read, and the guard against a stale response landing over a newer one. */
    date: null,
    /* Today as the reader's own clock reported it at boot. Held here rather than recomputed
     * because the offsets the stepper is drawn from have to be measured against a fixed
     * point, and because reading the clock in render is what would hydrate the wrong day. */
    today: null,
    /* The translation the days above were fetched in, not the one the reader prefers — that is
     * `prefs`'. Holding what is on the shelf rather than what was asked for is what lets `init`
     * decide whether the shelf is still good. */
    translation: DEFAULT_TRANSLATION,
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Boot fetch, from `initAuthorizedStores` — the reading is not scoped to the selected
     * group, so it has a request it can make the moment there is a viewer.
     *
     * Preloading a whole screen is worth it here because of what the reading costs: two
     * external services on the request path, where every other surface in the app is one
     * round trip to our own database. Warming it at sign-in turns the whole screen into a
     * navigation that has already happened, so the skeleton is only ever seen by somebody who
     * cold-loads `/prologue` directly.
     *
     * The neighbours are warmed too, and deliberately **not awaited**: they are every step
     * the stepper can take, so fetching them makes it instant, and leaving them off the
     * critical path means the day being read never waits on the two nobody has asked for. */
    init: async (translation = DEFAULT_TRANSLATION) => {
        const today = todayLocal()

        set(state => {
            state.today = today
            /* The days in hand were printed in another English, so they are not this
             * reader's reading any more. */
            if (state.translation !== translation) {
                state.translation = translation
                state.days = {}
            }
        })

        await get().show(today)

        for (let offset = 1; offset <= DAY_REACH; offset += 1) {
            get().fetch(addDays(today, -offset))
            get().fetch(addDays(today, offset))
        }
    },

    /* Reads one date into the cache and reports whether it landed. Touches nothing on screen,
     * which is what makes it safe to call for a day the reader is not looking at. */
    fetch: async (date) => {
        if (!date || get().days[date]) return true

        try {
            const day = await api.get(API_ENDPOINTS.PROLOGUE, {
                params: { date, translation: get().translation },
            })
            set(state => { state.days[date] = day })
            return true
        } catch (error) {
            /* Only the day on screen may raise an error. A warm-up that fails is not
             * something the reader asked for, so it stays silent and is simply retried the
             * next time that date is opened. */
            if (get().date === date) {
                set(state => {
                    state.error.load = toErrorList(error, "Could not load that day's reading.")
                })
            }
            return false
        }
    },

    /* Opens a date. Cached days appear on the same frame; only a miss shows a skeleton. */
    show: async (date) => {
        if (!date) return

        const cached = Boolean(get().days[date])

        set(state => {
            state.date = date
            state.error.load = false
            state.ready = cached
            state.loading.load = !cached
        })

        if (cached) return

        await get().fetch(date)

        set(state => {
            /* A step taken while this was in flight owns the screen now. */
            if (state.date !== date) return
            /* Resolved on the failure path too, so the skeleton settles onto the error
             * rather than spinning behind it. */
            state.ready = true
            state.loading.load = false
        })
    },

    /* Re-reads the day on screen, for the retry on the error state. Drops the cached copy
     * first, or `show` would answer from memory and the retry would be a no-op. */
    refresh: async () => {
        const date = get().date
        if (!date) return

        set(state => {
            delete state.days[date]
            state.ready = false
        })

        await get().show(date)
    },

    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = { load: false } }),
})))

export default useStore
