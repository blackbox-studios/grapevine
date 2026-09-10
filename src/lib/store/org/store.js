import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { ROUTES } from '@/lib/constants'
import { haptic } from '@/lib/native'

/* Which group the app is currently looking at, and whether the switcher is open.
 *
 * **This store owns a selection, not a collection.** The list of groups a viewer belongs to
 * already arrives with the viewer, from GET /api/me, and `useOrgs()` reads it there — a
 * second copy fetched here would be a second thing to go stale the moment an admin adds
 * someone to a parish. What is genuinely this store's is the *choice*: one id, and the
 * chrome that changes it.
 *
 * That is also why it has no `items`, no cursor, and no fetch. `ready` means a valid
 * selection has been resolved, which is the only thing downstream surfaces wait on.
 *
 * ── How a selection reaches the rest of the app ──────────────────────────────
 *
 * By being *read*, not by being pushed. Every org-scoped store holds the id it is currently
 * showing and takes the target id as an argument (`load(orgId)`), discarding responses for
 * a group the viewer has already left — the pattern `members` established and `feed` now
 * follows. Their hooks depend on `useCurrentOrg()`, so a change here re-runs their effect,
 * which calls `load` with the new id, which resets them to a skeleton and refetches.
 *
 * Doing it that way rather than having `select` reach into each store keeps the imports
 * one-directional. A store that must read the current org *and* be reset by it is a cycle:
 * `feed` would import `org` for the id while `org` imported `feed` to invalidate it. The
 * transient stores below are the exception, and they only go one way.
 *
 * The selection persists so a reload lands the reader back in the parish they were in.
 * It is validated against the viewer's real memberships on every boot (`resolve`), because
 * a persisted id is a cached guess and a revoked membership must not survive one. */

/* Module-level constants, not inline literals, and that is load-bearing rather than tidy.
 * `clearErrors` assigns this back onto the state, and `useErrorListener` re-runs whenever
 * the error object's *identity* changes — then clears again. A fresh `{}` per call is a new
 * identity every time, so the two chase each other until React gives up with "Maximum update
 * depth exceeded". Assigning the same frozen reference is a no-op Immer skips, so the state
 * object survives unchanged, zustand never notifies, and the cycle terminates. Nothing here
 * fetches, so both stay empty — the shape exists so the global aggregator has something to
 * walk. */
const ERROR_INIT = {}
const LOADING_INIT = {}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* The selected group's id. Persisted; only ever a value `resolve` has confirmed the
     * viewer still holds an APPROVED membership in. */
    currentId: null,

    /* Whether the mobile switcher is open. Held here rather than in the shell because
     * three separate fixed layers animate off it (the scroll container, the mobile rail,
     * the hamburger) and selecting a group has to close it — one flag they all read beats
     * threading a setter through the layout. */
    open: false,

    /* Whether the create-a-group surface is open. A flag rather than an id, because there is
     * no group yet to name it after. It sits here rather than in the surface because the
     * entrances (the desktop dropdown, the mobile panel) and <OrgCreator/>, mounted by the
     * shell, are three separate subtrees, and a flag they all read beats lifting state through
     * the layout to a common ancestor whose only job is to hold it. It is the same argument as
     * `open` above, which is why it sits beside it.
     *
     * Deliberately outside `partialize`, so it never persists: reopening the app into a form
     * nobody asked for would be a bug, not a restored session. */
    creating: false,
}

const useStore = create(
    immer(
        persist(
            (set, get) => ({
                ...INIT,

                /* Reconciles the selection against the groups the viewer actually holds.
                 *
                 * Called by `useCurrentOrg` whenever that list changes, which covers all
                 * three ways it can move: the viewer resolving after boot, an admin adding
                 * the viewer to a new parish, and a membership being revoked out from under
                 * a persisted id. Keeps the current choice when it is still valid, so a
                 * background refresh of the viewer never yanks the reader elsewhere. */
                resolve: (orgs = []) => set(state => {
                    const held = orgs.some(org => org.id === state.currentId)
                    if (!held) state.currentId = orgs[0]?.id ?? null
                    /* Ready once the question has been *answered*, which includes answering
                     * it with "none" — a viewer with no groups must resolve to an empty
                     * state rather than a skeleton that never clears. */
                    state.ready = orgs.length > 0 ? state.currentId !== null : true
                }),

                /* Switches groups and dismisses the switcher.
                 *
                 * One action for both because they are one gesture: the menu closing is how
                 * the reader is told the tap landed. It routes through `setOpen` rather than
                 * writing `open` itself, so the close is confirmed by the same tap as every
                 * other close — a selection that dismissed the panel silently was the one
                 * way out of it that gave no feedback at all. */
                select: (orgId) => {
                    if (!orgId) return
                    set(state => { state.currentId = orgId })
                    get().setOpen(false)
                },

                /* The switcher's gear: select the row it belongs to, dismiss the panel, and go
                 * to `/group` — three things one tap does. Selecting first is what keeps the
                 * tree's pages scoped correctly (they read the selection, not an id in the
                 * URL), and it has to happen before the navigation rather than after, since the
                 * pages resolve against `currentId` the moment they render.
                 *
                 * The router is handed in and used here, alongside the state change it follows,
                 * rather than in the hook — see the auth store's `verifyCode` for the same shape. */
                openGroupSettings: (orgId, router) => {
                    if (!orgId) return
                    get().select(orgId)
                    router.push(ROUTES.GROUP, { scroll: false })
                },

                /* Going to a group, which is what a notification saying somebody added you to
                 * one opens.
                 *
                 * **Selecting it is the substantive half**, exactly as it is for the gear
                 * above: the feed is scoped to the selection rather than to an id in the URL,
                 * so switching *is* the navigation, and the route is only where the reader has
                 * to be standing to see it.
                 *
                 * `router.push` rather than a slide dismissal, and it covers both entrances
                 * without knowing which it is: moving the URL off a slide route is what closes
                 * one (see `activeSlides`), so the notifications panel a group was tapped in
                 * comes down on the way to the feed, and a tapped push banner on a cold launch
                 * lands there with nothing to unwind. */
                openOrg: (orgId, router) => {
                    if (!orgId) return
                    get().select(orgId)
                    router.push(ROUTES.DEFAULT, { scroll: false })
                },

                /* The switcher's open state. Every transition is confirmed by a tap, on the
                 * way in and on the way out, because the panel does not cover the content —
                 * it pushes it — and a shove with no tactile edge reads as a mis-scroll. */
                setOpen: (open) => {
                    if (get().open === open) return
                    set(state => { state.open = open })
                    haptic("light")
                },

                toggle: () => get().setOpen(!get().open),

                /* Opens the create-a-group surface, closing the switcher that asked for it —
                 * the panel is what the reader just acted from, so leaving it standing behind
                 * the sheet would be two open surfaces for one decision. There is no `select`
                 * here because there is nothing to select yet; the new group is selected once
                 * it exists, by
                 * `useOrgCreator`. Named for the surface it opens, not for the write —
                 * that is the auth store's `createOrg`, because the row lands in the viewer's
                 * groups. */
                openCreator: () => {
                    get().setOpen(false)
                    set(state => { state.creating = true })
                },

                closeCreator: () => set(state => { state.creating = false }),

                /* Nothing to re-read: the selection is validated by `resolve` off the
                 * viewer, and the viewer is the auth store's to refresh. */
                refresh: async () => {},
                init: async () => {},

                /* The selected id survives a reset on purpose — `reset` runs on sign-out,
                 * and the persisted choice is scoped to this device rather than to the
                 * session, so returning to the same parish on the next sign-in is the
                 * behaviour a shared family iPad wants.
                 *
                 * `ready` does not survive it. It is the assertion that the id has been
                 * checked against *this* viewer's memberships, and the next person to sign
                 * in has not been checked yet — leaving it true would let the shell load a
                 * feed with the previous viewer's parish id for the frame before `resolve`
                 * runs. The switcher closes for the obvious reason: otherwise it reopens
                 * over the login screen. */
                reset: () => set(state => {
                    state.ready = false
                    state.open = false
                    state.creating = false
                    state.error = ERROR_INIT
                }),
                clearErrors: () => set(state => { state.error = ERROR_INIT }),
            }),
            {
                partialize: (state) => ({ currentId: state.currentId }),
                name: 'grapevine-org',
            },
        ),
    ),
)

export default useStore
