import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS } from '@/lib/constants'
import useCalendarStore from '@/lib/store/calendar/store'
import useSignupsStore from '@/lib/store/signups/store'
import { toErrorList } from '@/lib/utils'

/* The one open sign-up sheet, and every write to a slot inside it.
 *
 * ── Why this is a second store ───────────────────────────────────────────────
 *
 * The same split as `feed`/`post` and `profile`/`follows`, applied a third time. `signups` owns
 * the list of rotas; this owns the one the reader has expanded. They have different lifetimes —
 * the list is long-lived and pageable, an open rota is transient and addressed by id — and the
 * writes belong to the *entity* rather than to the surface that renders it: the same slot is
 * claimed from an accordion on the sign-ups tab, from a block on the day's timeline, and edited
 * in the admin's edit mode, and all three go through here so no two of them can disagree.
 *
 * ── Opening a rota is not a request ─────────────────────────────────────────
 *
 * The list ships every sheet with its dates, so `load` promotes the loaded rota **synchronously**
 * and refreshes behind it — the same order `post.load` follows with the feed's cached row, and
 * for the same reason: there is a complete surface available on the first frame, so covering it
 * with a spinner would be a regression. The skeleton is only ever paid on a rota this session
 * has not listed, which on this surface means none.
 *
 * ── Two arrows out, both narrow, both one-directional ───────────────────────
 *
 *   → `signups.applySlot`    the slot inside the rota's row, which is what every number the
 *                            list shows is counted from
 *   → `calendar.patchSlot`   the ring on the month grid, and the block on the day's timeline
 *
 * Both exist for one reason: the same slot is on screen in more than one place at once. The
 * calendar tab and the sign-ups tab are two halves of one page, so a Take pressed on one has to
 * be true on the other the moment the reader flips — which is the failure the feed and the open
 * post had before `patchPost`, arrived at again from a different direction.
 *
 * ── Writes are not optimistic, deliberately ──────────────────────────────────
 *
 * A like is optimistic because it cannot fail in any way the reader cares about. A sign-up
 * can: the last place goes to whoever's transaction commits first, and capacity is settled by
 * a locked read on the server. Showing somebody as signed up and then taking it back is a
 * worse experience than a spinner on one button for a third of a second — and it is precisely
 * the failure that matters here, because the person who was told they had a place is the
 * person who does not turn up. Administrative writes are not optimistic for the same reason
 * `members` is not.
 */

const ERROR_INIT = {
    sheet: false,
    write: false,
}

const LOADING_INIT = {
    sheet: false,
    /* Keyed by slot id, so one row's spinner does not disable the whole rota. */
    slot: {},
    write: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* Which sheet is expanded. Held here rather than in the accordion, for the reason
     * `profile.openHandle` is held in a store: it is set from the list, from a notification,
     * and from a push payload, and those are three separate subtrees. */
    openId: null,

    /* The sheet being requested, tracked apart from the one loaded so a slow response for a
     * rota the reader has already collapsed can be discarded. */
    currentId: null,
    current: null,
}

/* Applies one authoritative slot everywhere a copy of it is on screen. Every write below ends
 * here, which is what keeps "the same slot in three places" from being three code paths.
 *
 * It does not care whether a rota is open: a slot claimed from the day view has none, and the
 * list and the calendar still have to move. Both targets find their own copy by id. */
const applySlot = (set, get, slot) => {
    if (get().current?.id === slot.sheetId) {
        set(state => {
            const index = state.current.slots.findIndex(row => row.id === slot.id)
            if (index !== -1) state.current.slots[index] = slot
        })
    }

    useSignupsStore.getState().applySlot(slot)
    useCalendarStore.getState().patchSlot(slot.id, {
        taken: slot.taken,
        capacity: slot.capacity,
        spotsLeft: slot.spotsLeft,
        canceled: slot.canceled,
        mine: slot.mine,
        onBehalfOf: [
            ...new Set(slot.claims.map(claim => claim.onBehalfOf).filter(Boolean)),
        ],
    })
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Opens a sheet — or closes the one already open, since the accordion's trigger is the
     * same tap either way. */
    toggle: (sheetId, options) => {
        if (get().openId === sheetId) {
            get().close()
            return
        }
        get().open(sheetId, options)
    },

    open: (sheetId, options) => {
        set(state => { state.openId = sheetId })
        get().load(sheetId, options)
    },

    close: () => set(state => {
        state.openId = null
        state.currentId = null
        state.current = null
        state.ready = false
    }),

    /* Fetches one sheet by id, with its dates and everyone on them.
     *
     * The order is the whole feature, and it is `post.load`'s:
     *
     *  1. **Promote the listed rota synchronously.** The list shipped its dates, so the
     *     accordion has a complete surface to paint on the frame the tap landed on.
     *  2. **Refresh in the background, silently.** No skeleton over a surface that is already
     *     there; only a rota this session never listed pays one.
     *  3. **Discard a late response** for a rota the reader has since collapsed.
     *
     * `all` asks for the whole history rather than the fortnight-and-forward window, which is
     * what edit mode wants: an admin is editing a record rather than signing up for a future.
     * The cached copy is the narrower window, so it is promoted first and then replaced by the
     * fuller answer. */
    load: async (sheetId, { all = false } = {}) => {
        if (!sheetId) return

        const cached = useSignupsStore.getState().cachedSheet(sheetId)

        set(state => {
            if (state.currentId !== sheetId) {
                state.current = cached
                state.ready = cached !== null
            }
            state.currentId = sheetId
            state.loading.sheet = true
        })

        try {
            const sheet = await api.get(API_ENDPOINTS.SIGNUP(sheetId), {
                params: all ? { all: 1 } : undefined,
            })
            set(state => {
                /* A response for a sheet the reader has already collapsed. */
                if (state.currentId !== sheetId) return
                state.current = sheet
                state.ready = true
            })
            /* The list's copy is a round trip older than this one, so it is corrected — except
             * in `all` mode, where this response deliberately carries dates outside the window
             * the list keeps, and writing them back would leave the row holding a rota's whole
             * history for every other reader of it. */
            if (!all) useSignupsStore.getState().replaceSheet(sheet)
        } catch (error) {
            set(state => {
                if (state.currentId !== sheetId) return
                state.error.sheet = toErrorList(error, 'Could not open that sign-up sheet.')
                /* Ready on the failure path, or the skeleton never resolves to the
                 * not-found state. */
                state.ready = true
            })
        } finally {
            set(state => {
                if (state.currentId === sheetId) state.loading.sheet = false
            })
        }
    },

    /* ── Taking and giving up a place ───────────────────────────────────────── */

    /* Takes a place on one date. Answers with the slot so the caller can tell success from a
     * refusal without reading the store. */
    claim: async (slotId, { onBehalfOf, note, remind } = {}) => {
        set(state => {
            state.loading.slot[slotId] = true
            state.error.write = false
        })
        try {
            const slot = await api.post(API_ENDPOINTS.SLOT_CLAIMS(slotId), {
                onBehalfOf,
                note,
                remind,
            })
            applySlot(set, get, slot)
            return slot
        } catch (error) {
            set(state => {
                state.error.write = toErrorList(error, 'Could not sign you up for that date.')
            })
            return null
        } finally {
            set(state => { delete state.loading.slot[slotId] })
        }
    },

    /* Gives up a place — the viewer's own, or somebody else's if they administer the group.
     * `slotId` is passed alongside the claim id purely so the spinner can sit on the right
     * row; the endpoint needs only the claim. */
    release: async (claimId, slotId) => {
        set(state => {
            state.loading.slot[slotId] = true
            state.error.write = false
        })
        try {
            const slot = await api.delete(API_ENDPOINTS.CLAIM(claimId))
            applySlot(set, get, slot)
            return slot
        } catch (error) {
            set(state => {
                state.error.write = toErrorList(error, 'Could not give up that place.')
            })
            return null
        } finally {
            set(state => { delete state.loading.slot[slotId] })
        }
    },

    /* ── Administering the rota ─────────────────────────────────────────────── */

    /* One date's capacity, note, or cancellation.
     *
     * Cancelling is the one write here with a consequence outside this sheet: everybody on the
     * date is notified, and the viewer's own strip has to lose it, because a cancelled date is
     * not something they are still signed up for. */
    saveSlot: async (slotId, patch) => {
        set(state => {
            state.loading.slot[slotId] = true
            state.error.write = false
        })
        try {
            const slot = await api.patch(API_ENDPOINTS.SLOT(slotId), patch)
            applySlot(set, get, slot)
            return slot
        } catch (error) {
            set(state => {
                state.error.write = toErrorList(error, 'Could not update that date.')
            })
            return null
        } finally {
            set(state => { delete state.loading.slot[slotId] })
        }
    },

    /* Removes a date outright. The server refuses once anybody has signed up — cancelling is
     * what that case wants — so a failure here is a message rather than a state to reconcile. */
    removeSlot: async (slotId) => {
        set(state => {
            state.loading.slot[slotId] = true
            state.error.write = false
        })
        try {
            await api.delete(API_ENDPOINTS.SLOT(slotId))
            const sheetId = get().current?.id
            set(state => {
                if (state.current) {
                    state.current.slots = state.current.slots.filter(row => row.id !== slotId)
                }
            })
            if (sheetId) useSignupsStore.getState().removeSlot(sheetId, slotId)
            return true
        } catch (error) {
            set(state => {
                state.error.write = toErrorList(error, 'Could not remove that date.')
            })
            return false
        } finally {
            set(state => { delete state.loading.slot[slotId] })
        }
    },

    /* Title, description, or whether the rota is still taking people. */
    save: async (patch) => {
        const sheetId = get().currentId
        if (!sheetId) return null

        set(state => {
            state.loading.write = true
            state.error.write = false
        })
        try {
            const sheet = await api.patch(API_ENDPOINTS.SIGNUP(sheetId), patch)
            set(state => {
                if (state.currentId === sheetId) state.current = sheet
            })
            useSignupsStore.getState().replaceSheet(sheet)
            return sheet
        } catch (error) {
            set(state => {
                state.error.write = toErrorList(error, 'Could not update that sign-up sheet.')
            })
            return null
        } finally {
            set(state => { state.loading.write = false })
        }
    },

    /* Puts more dates on a rota that has run out. Answers with the whole sheet, because
     * `skipDuplicates` means the client cannot know which dates were actually added. */
    extend: async (input) => {
        const sheetId = get().currentId
        if (!sheetId) return null

        set(state => {
            state.loading.write = true
            state.error.write = false
        })
        try {
            const sheet = await api.post(API_ENDPOINTS.SIGNUP_SLOTS(sheetId), input)
            set(state => {
                if (state.currentId === sheetId) state.current = sheet
            })
            useSignupsStore.getState().replaceSheet(sheet)
            /* The new dates are not on the loaded month unless they happen to fall in it, and
             * working out which do is the calendar's own query — so it is asked again. */
            useCalendarStore.getState().refresh()
            return sheet
        } catch (error) {
            set(state => {
                state.error.write = toErrorList(error, 'Could not add those dates.')
            })
            return null
        } finally {
            set(state => { state.loading.write = false })
        }
    },

    refresh: async () => {
        const sheetId = get().currentId
        if (sheetId) await get().load(sheetId)
    },

    init: async () => {},

    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
