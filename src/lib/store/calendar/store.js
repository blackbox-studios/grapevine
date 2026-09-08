import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS } from '@/lib/constants'
import { haptic } from '@/lib/native'
import { dateFromKey, dayKey, monthGrid, startOfMonth, toErrorList } from '@/lib/utils'

/* The compiled calendar: one group, its months, and whichever day is open.
 *
 * ── Months are kept, not replaced ────────────────────────────────────────────
 *
 * `months` is a cache keyed by "YYYY-MM", and paging is a lookup in it before it is a request.
 * A calendar is read by moving through it — forward to see what is coming, back to check what
 * happened — and a skeleton on every one of those moves makes a month feel like a page load.
 * So a resolved month is kept, and its two neighbours are fetched quietly behind it, which
 * means the first step in either direction is instant and every step after it stays ahead.
 *
 * The cache is per group and is emptied when the selection moves: one parish's Vespers must
 * never be served from another's window.
 *
 * ── One view at a time ──────────────────────────────────────────────────────
 *
 * `view` is `month` or `day`, never both. A grid with a day's events underneath it is two
 * screens stacked, and on a phone it is a grid you scroll past to reach the thing you tapped —
 * so tapping a square *goes* to that day, and the day has its own way back and its own arrows.
 * The month behind it is already in memory, so both directions are free.
 */

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

    orgId: null,

    /* The month on screen. `monthKey` is its "YYYY-MM" — the comparable form, and the key both
     * the cache and a late response are checked against. */
    month: null,
    monthKey: null,

    /* "YYYY-MM": the window's entries. Every window this session has resolved for the selected
     * group. */
    months: {},

    /* Whether the selected group has a calendar feed at all — "nothing on in March" and "this
     * parish keeps no calendar" are two empty grids wanting different words. It belongs to the
     * group rather than to a month, so it has to be declared here for `reset` to clear it on a
     * switch. */
    hasCalendar: false,

    /* The day the day view is showing, and which of the two surfaces is on screen. */
    selected: null,
    view: 'month',
}

/* Requests in flight, keyed `orgId:monthKey`.
 *
 * Module-level rather than in the store because it is request bookkeeping and not UI state:
 * nothing renders from it, and putting a Set in immer state would mean either a draft-safe copy
 * per write or a second re-render for every prefetch that resolves. Same argument as
 * `openedStack` in `useSlideRoute.hook.js`. */
const inFlight = new Set()

const monthKeyOf = (month) =>
    `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`

/* The six weeks a month's grid draws, as the window the endpoint wants.
 *
 * Taken from `monthGrid` rather than from the month's own first and last day, because the grid
 * shows the tail of the previous month and the head of the next — and an event on one of those
 * squares has to be there when the reader looks at it, not when they page. */
const windowFor = (month) => {
    const grid = monthGrid(month)
    const to = new Date(grid[grid.length - 1])
    to.setDate(to.getDate() + 1)
    return { from: grid[0].toISOString(), to: to.toISOString() }
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Fetches one month into the cache. Answers nothing and shows nothing — `load` decides what
     * is on screen, this only fills the shelf. Used for the month being opened and for its
     * neighbours alike, which is what keeps one code path for both. */
    fetch: async (orgId, month) => {
        const key = monthKeyOf(month)
        const token = `${orgId}:${key}`
        if (inFlight.has(token) || get().months[key]) return
        inFlight.add(token)

        try {
            const { items, hasCalendar } = await api.get(API_ENDPOINTS.EVENTS, {
                params: { orgId, ...windowFor(month) },
            })
            set(state => {
                /* A response for a group the viewer has already left. Checked here rather than
                 * by the caller, because a prefetch outlives the month that started it. */
                if (state.orgId !== orgId) return
                state.months[key] = items
                state.hasCalendar = hasCalendar
                if (state.monthKey === key) state.ready = true
            })
        } catch (error) {
            set(state => {
                if (state.orgId !== orgId) return
                /* Cached as empty rather than left absent, so a failed month is not re-requested
                 * on every render — and so the surface settles on "nothing this month" instead
                 * of a skeleton that never clears. */
                state.months[key] = []
                state.error.list = toErrorList(error, 'Could not load the calendar.')
                if (state.monthKey === key) state.ready = true
            })
        } finally {
            inFlight.delete(token)
            set(state => {
                if (state.orgId === orgId && state.monthKey === key) state.loading.list = false
            })
        }
    },

    /* Warms the months either side of the one on screen.
     *
     * One step ahead in each direction, not more: that is enough for paging to be instant from
     * the second move onward — each step warms the next — and a deeper window would be four
     * requests on boot to serve a reader who mostly looks at this month. */
    prefetchNeighbours: (orgId, month) => {
        get().fetch(orgId, startOfMonth(month, -1))
        get().fetch(orgId, startOfMonth(month, 1))
    },

    /* Fills the month a reader would land on, before they ask for it.
     *
     * The events tab is one tap from every screen and a window is resolved through the parish's
     * own Google Calendar, so its wait is somebody else's network rather than our own tables.
     * Spending an idle moment on it at boot and on a group switch is what keeps that wait off
     * the screen.
     *
     * The group and the month are both claimed here rather than left to `load`: a response
     * whose group no longer matches is dropped, and `ready` is set by whichever fetch answers
     * for the month *on record* — so claiming both is what lets the surface mount on a resolved
     * window instead of a frame behind its own effect. A month the reader has already paged to
     * is left where it is, and `view` is untouched, because which of the two surfaces is on
     * screen belongs to whoever opened it. */
    warm: (orgId) => {
        if (!orgId) return

        if (get().orgId !== orgId) {
            set(state => {
                state.orgId = orgId
                state.months = {}
                state.ready = false
            })
        }

        const target = get().month ?? startOfMonth(new Date())
        set(state => {
            if (state.month) return
            state.month = target
            state.monthKey = monthKeyOf(target)
        })

        get().fetch(orgId, target)
        get().prefetchNeighbours(orgId, target)
    },

    /* Puts the selected month on screen, from the cache when it is there.
     *
     * **Takes no month, and the write below is guarded.** Both are the same rule: called with
     * nothing to change, this must change nothing.
     *
     * The month is this store's, and the actions that move it (`step`, `today`, `stepDay`) set
     * it before the hook's effect re-runs, so it is read here rather than handed in. A `month`
     * argument would have to be normalized — `startOfMonth(month ?? new Date())` — which mints a
     * fresh `Date` and writes it back on every call; the effect that calls this depends on that
     * value, so a new identity per call is an update loop rather than a wasted render. */
    load: async (orgId) => {
        if (!orgId) return

        if (get().orgId !== orgId) {
            /* A different group is a different calendar. The cache goes with it, or one
             * parish's Vespers is served out of another's window. */
            set(state => {
                state.orgId = orgId
                state.months = {}
                state.ready = false
            })
        }

        const state = get()
        const target = state.month ?? startOfMonth(new Date())
        const key = monthKeyOf(target)
        const cached = state.months[key] !== undefined

        if (state.month !== target || state.monthKey !== key || state.ready !== cached) {
            set(draft => {
                draft.month = target
                draft.monthKey = key
                draft.ready = cached
                draft.loading.list = !cached
            })
        }

        if (!cached) await get().fetch(orgId, target)
        get().prefetchNeighbours(orgId, target)
    },

    /* Opens a day. Its month is already on screen, so this is a view change and not a fetch. */
    openDay: (day) => set(state => {
        state.selected = day
        state.view = 'day'
    }),

    closeDay: () => set(state => { state.view = 'month' }),

    /* The previous or next day, from inside the day view.
     *
     * **Stepping off the loaded window moves the month with it.** The window is the six weeks
     * the grid draws, so a step is almost always within it; at either edge it is not, and
     * leaving the month behind would show an empty day for a date that has events. Setting
     * `month` is what the hook's effect turns into a load — which is usually a cache hit,
     * because the neighbour was warmed when this month opened. */
    stepDay: (delta) => {
        haptic('light')
        set(state => {
            const from = dateFromKey(state.selected) ?? new Date()
            const next = new Date(from)
            next.setDate(from.getDate() + delta)
            state.selected = dayKey(next)

            const window = monthGrid(state.month ?? next)
            if (next < window[0] || next > window[window.length - 1]) {
                const target = startOfMonth(next)
                state.month = target
                state.monthKey = monthKeyOf(target)
                state.ready = state.months[monthKeyOf(target)] !== undefined
            }
        })
    },

    /* Pages a month. The load is left to the hook's effect, which re-runs on the month this
     * just set — so the fetch (or the cache hit) stays in one place. */
    step: (delta) => {
        haptic('light')
        set(state => {
            const next = startOfMonth(state.month ?? new Date(), delta)
            state.month = next
            state.monthKey = monthKeyOf(next)
            state.ready = state.months[monthKeyOf(next)] !== undefined
        })
    },

    /* Back to the month containing today. The one navigation that names a destination rather
     * than a direction, and the surface only offers it when the reader is somewhere else. */
    today: () => set(state => {
        const now = startOfMonth(new Date())
        state.month = now
        state.monthKey = monthKeyOf(now)
        state.ready = state.months[monthKeyOf(now)] !== undefined
    }),

    /* The whole surface area the `sheet` store has to this one: apply a slot's authoritative
     * numbers to the ring that stands for it, in every month that holds it.
     *
     * Across the cache rather than the visible month alone — a rota's dates run into next month
     * too, and a warmed window holding a stale count would show it the moment the reader pages
     * there. */
    patchSlot: (slotId, patch) => set(state => {
        for (const items of Object.values(state.months)) {
            const entry = items.find(item => item.slotId === slotId)
            if (entry) Object.assign(entry, patch)
        }
    }),

    refresh: async () => {
        const orgId = get().orgId
        if (!orgId) return
        set(state => {
            state.months = {}
            state.ready = false
        })
        await get().load(orgId)
    },

    /* Nothing to boot: there is no calendar until a group has resolved, and the hook's effect
     * is what resolves it. Out of `initAuthorizedStores` for the same reason `feed` is. */
    init: async () => {},

    reset: () => set(() => ({ ...INIT, months: {} })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
