import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS } from '@/lib/constants'

/* What the Church keeps on a given day, by date.
 *
 * Read by the sign-up surface on a rota whose creator turned the rule on (`showFasting`), so
 * somebody taking coffee hour three Sundays out can see whether that Sunday is a fast before
 * they decide what to cook.
 *
 * ── Keyed by date, and it keeps what it has read ─────────────────────────────
 *
 * The rule for a date never changes, and it is the same rule in every parish, so a day once read
 * is answered from memory forever after. That is what makes this worth warming: the dates on a
 * rota are known the moment the rota is on screen, long before anybody taps one, so `warm` fills
 * them in an idle moment and the sign-up surface opens on an answer instead of a skeleton. Same
 * shape as `prologue`, which warms the days its stepper can reach.
 *
 * ── No errors, and none of it is the reader's request ────────────────────────
 *
 * There is no `error` here and this store is absent from `useErrors`: a day whose rule could not
 * be read renders **nothing**, exactly as the Daily Read's strip does, because neither surface is
 * about the fast. A toast over a sign-up form apologising for an almanac is worse than the plain
 * form that was there before this feature existed. A null answer is deliberately not cached — the
 * almanac having a bad minute is not a fact about the day — so the next date that asks for it
 * tries again. */

const INIT = {
    /* Rules by `YYYY-MM-DD`. Only rules that actually resolved; see the header. */
    days: {},
    /* Dates being read right now, so the surface waiting on one can show a skeleton. Keyed
     * rather than a single flag, because a warm of four dates runs behind whichever one the
     * reader is looking at. */
    loading: {},
}

/* Requests in flight. Module-level rather than in the store for the reason the calendar's is:
 * it is request bookkeeping, nothing renders from it, and a Set in immer state would mean a
 * copy per write. It also has to be checked *before* the loading flag is set, which is what
 * makes a warm and an open of the same date one request rather than two. */
const inFlight = new Set()

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Reads one date into the cache. Shows nothing and answers nothing — the hook decides what
     * is on screen; this only fills the shelf, which is what lets one code path serve both the
     * date being opened and the three being warmed behind it. */
    fetch: async (date) => {
        if (!date || get().days[date] || inFlight.has(date)) return
        inFlight.add(date)
        set(state => { state.loading[date] = true })

        try {
            const { fasting } = await api.get(API_ENDPOINTS.FASTING, { params: { date } })
            if (fasting) set(state => { state.days[date] = fasting })
        } catch {
            /* Swallowed on purpose: see the header. Nothing asked for this out loud, and the
             * surface that wanted it degrades to not drawing the strip. */
        } finally {
            inFlight.delete(date)
            set(state => { delete state.loading[date] })
        }
    },

    /* The dates a surface can see, read before anybody taps one. Not awaited, and not ordered:
     * these are all equally likely to be the one that is opened. */
    warm: (dates) => {
        for (const date of dates ?? []) get().fetch(date)
    },

    reset: () => set(() => ({ ...INIT })),
})))

export default useStore
