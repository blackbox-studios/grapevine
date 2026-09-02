import { create } from "zustand"
import { immer } from "zustand/middleware/immer"

import api from "@/lib/api"
import { API_ENDPOINTS, PAGE_SIZE } from "@/lib/constants"
import { toErrorList } from "@/lib/utils"

/* The two follow lists of the person whose card is open — followers, and following.
 *
 * The same split the feed and the open post have, for the same reason: a paginated list and the
 * single resource it hangs off are two lifetimes. `profile` owns the person being read and every
 * write to a follow; this owns the rows of both lists about them, and is cleared when the card
 * closes.
 *
 * **Both lists, loaded together, in one request pair when the card opens.** They are two tabs of
 * one surface that a reader flips between freely, so loading per tab would spend a round trip
 * and a skeleton on every flip — for a page of at most twenty rows. One extra request up front
 * buys every switch after it.
 *
 * A slot per direction, not one shared slot, is also what lets all three tab panels stay mounted
 * and cross-fade: two lists sharing one would fight over which direction it was loading.
 *
 * **Keyed by one handle at a time, not cached per person.** Only one card is open, and walking
 * from somebody to one of their followers is a different person's lists — so a new handle
 * replaces these rather than joining a map nothing would ever evict.
 *
 * It imports nothing. `profile` reaches in through `patchRow` to keep a follow tapped in a list
 * in step with the same person's card header, which keeps the dependency one-directional —
 * `follows` ← `profile`, and never the other way. */

const ERROR_INIT = {
    list: false,
}

const LOADING_INIT = {
    /* The pair of opening reads. One flag, because they are one action. */
    list: false,
    /* Paging past the first page, per direction — a spinner at the foot of one list must not
     * disable the other. */
    followers: false,
    following: false,
}

/* One direction's page. `cursor` is the opaque continuation token the server handed back;
 * treat it as a string and never parse it. */
const LIST_INIT = { items: [], cursor: null, hasMore: true }

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* Whose lists these are. */
    handle: null,
    lists: { followers: { ...LIST_INIT }, following: { ...LIST_INIT } },
}

const endpointFor = (handle, kind) =>
    kind === "followers"
        ? API_ENDPOINTS.PROFILE_FOLLOWERS(handle)
        : API_ENDPOINTS.PROFILE_FOLLOWING(handle)

const useStore = create(
    immer((set, get) => ({
        ...INIT,

        /* Opens both lists for one person.
         *
         * The rows go *now* rather than when the responses land: leaving them would show one
         * person's followers under another's name for a round trip, and every row's follow
         * button would write against the wrong list. Same rule the roster follows. */
        load: async (handle) => {
            if (!handle) return
            if (get().handle === handle && get().ready) return

            set((state) => {
                state.handle = handle
                state.lists = { followers: { ...LIST_INIT }, following: { ...LIST_INIT } }
                state.ready = false
                state.error.list = false
                state.loading.list = true
            })

            try {
                /* Independent reads, so they go together — see "Parallel API calls" in
                 * frontend-architecture.md. */
                const [followers, following] = await Promise.all([
                    api.get(endpointFor(handle, "followers"), {
                        params: { limit: PAGE_SIZE.FOLLOWS },
                    }),
                    api.get(endpointFor(handle, "following"), {
                        params: { limit: PAGE_SIZE.FOLLOWS },
                    }),
                ])

                set((state) => {
                    /* A late response for a card the reader has already left. */
                    if (state.handle !== handle) return
                    state.lists.followers = {
                        items: followers.items,
                        cursor: followers.nextCursor,
                        hasMore: followers.nextCursor !== null,
                    }
                    state.lists.following = {
                        items: following.items,
                        cursor: following.nextCursor,
                        hasMore: following.nextCursor !== null,
                    }
                    state.ready = true
                })
            } catch (error) {
                set((state) => {
                    if (state.handle !== handle) return
                    state.error.list = toErrorList(error, "Could not load those lists.")
                    /* Readiness resolves on the failure path too, or the skeleton spins
                     * forever instead of settling on the empty state. */
                    state.ready = true
                })
            } finally {
                set((state) => {
                    if (state.handle === handle) state.loading.list = false
                })
            }
        },

        loadMore: async (kind) => {
            const { handle, lists, loading, ready } = get()
            const list = lists[kind]
            if (!handle || !ready || !list?.hasMore || !list.cursor || loading[kind]) return

            set((state) => {
                state.loading[kind] = true
            })
            try {
                const { items, nextCursor } = await api.get(endpointFor(handle, kind), {
                    params: { limit: PAGE_SIZE.FOLLOWS, cursor: list.cursor },
                })
                set((state) => {
                    if (state.handle !== handle) return
                    const seen = new Set(state.lists[kind].items.map((item) => item.id))
                    state.lists[kind].items.push(...items.filter((item) => !seen.has(item.id)))
                    state.lists[kind].cursor = nextCursor
                    state.lists[kind].hasMore = nextCursor !== null
                })
            } catch (error) {
                set((state) => {
                    state.error.list = toErrorList(error, "Could not load more people.")
                })
            } finally {
                set((state) => {
                    state.loading[kind] = false
                })
            }
        },

        /* The lists' whole surface area to the store that owns a follow: patch one person's row
         * by id, wherever they appear. **Both directions**, because they overlap — somebody can
         * be in your followers and in your following at once, and a button tapped in one list
         * that left the other saying the opposite is the disagreement this exists to prevent. */
        patchRow: (profileId, patch) =>
            set((state) => {
                for (const kind of ["followers", "following"]) {
                    const row = state.lists[kind].items.find((item) => item.id === profileId)
                    if (row) Object.assign(row, patch)
                }
            }),

        /* Closes the card's lists. Transient, so the next open starts clean rather than flashing
         * the previous person's followers. */
        reset: () => set(() => ({ ...INIT })),
        clearErrors: () =>
            set((state) => {
                state.error = ERROR_INIT
            }),
    })),
)

export default useStore
