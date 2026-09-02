import { create } from "zustand"
import { immer } from "zustand/middleware/immer"

import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/constants"
import { haptic } from "@/lib/native"
import useAuthStore, { viewerProfile } from "@/lib/store/auth/store"
import useFollowsStore from "@/lib/store/follows/store"
import { toErrorList } from "@/lib/utils"

/* The person whose card is open — and the owner of every follow in the app.
 *
 * The same two responsibilities `post` carries, for the same reasons:
 *
 *  1. **Detail, fetched by handle.** There is no list of people to resolve it from — the app
 *     has no directory, deliberately — so a byline's handle is the whole input.
 *  2. **The follow toggle.** The button is tapped from the card's header *and* from a row in
 *     its follower list, so it cannot live with either surface. It lives here, and every toggle
 *     lands on both copies of the person: this store's `current` and the list's row.
 *
 * **`openHandle` is the surface's open state, and it is here rather than in the component** on
 * the same grounds the org store holds `creating`: a handle is tapped from a comment row, a feed
 * byline, the account page and a row inside the card itself, and every one of those is a
 * different subtree. One value in one store, one `<ProfileCard/>` mounted by the shell.
 *
 * Not a route. Somebody else's profile is a card you peek at and dismiss — component-state
 * semantics, so Android's back gesture closes it rather than unwinding a history entry — and
 * the *editable* half of it is `/settings/info`, which is a static route in the account tree.
 *
 * Transient, like `post`: closing clears it, so the next open starts clean rather than flashing
 * the previously-viewed person. That is also why it is out of `initAuthorizedStores` — there is
 * no boot fetch, and global readiness must not wait on a surface that may never open.
 *
 * **The viewer's own card is seeded, and nobody else's is.** `/api/me` already carries
 * everything `projectProfile` sends about the viewer, tallies included, so `open` fills the card
 * in from that copy before the surface mounts and it paints complete on the first frame — the
 * same trick as an opened post seeded from the feed's cached row. It is the card a person opens
 * most, and it is the one the app never has to fetch to draw.
 *
 * Somebody else's has nothing to promote and shows a skeleton for one round trip. A byline
 * carries a handle, an avatar and a name but no follower count and no answer to "do I follow
 * them", and seeding half a header would make the counts arrive a beat after the rest — which
 * reads worse than the whole thing arriving at once. */

const ERROR_INIT = {
    detail: false,
    follow: false,
}

const LOADING_INIT = {
    detail: false,
}

const INIT = {
    /* Set on the success *and* the failure path, so a handle that does not resolve settles on
     * "Person not found" instead of spinning forever. */
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* Whose card is open, or null. The surface derives from this alone, so nothing can be
     * open for one person while showing another. */
    openHandle: null,

    /* `current` is the resource; `currentHandle` is what the app asked for, which is not the
     * same thing while a fetch is in flight. Keeping them apart is what lets a late response
     * for a person the reader has already left be discarded. */
    current: null,
    currentHandle: null,
}

/* The viewer's own row in the shape `/api/profiles/:handle` answers, or null for anybody else.
 *
 * The tally check is not belt and braces: the auth store persists the viewer, so a session that
 * predates those fields rehydrates without them, and painting 0 followers for a round trip is a
 * worse answer than a skeleton. */
const seedFor = (handle) => {
    const viewer = useAuthStore.getState().user
    if (viewer?.handle !== handle) return null
    return typeof viewer.followers === "number" ? viewerProfile(viewer) : null
}

const useStore = create(
    immer((set) => ({
        ...INIT,

        /* Opens the card on somebody. Called again from a row inside it, which is how a reader
         * walks from one person to the next — the surface stays up and its subject changes. */
        open: (handle) => {
            if (!handle) return

            /* **The viewer's own card is filled in here, in the click handler, not in the load
             * effect.** Seeding a frame later means the surface mounts with nothing to draw, so
             * it commits a skeleton for one frame before the seed replaces it — and a skeleton
             * that is committed at all is a skeleton `<AnimatePresence/>` will play an exit for.
             * Filling `current` before the surface exists is what makes "no loading state on
             * your own card" true rather than nearly true. */
            const seed = seedFor(handle)

            set((state) => {
                state.openHandle = handle
                state.currentHandle = handle
                state.current = seed
                state.ready = seed !== null
            })
        },

        close: () => set((state) => ({ ...state, ...INIT })),

        load: async (handle) => {
            if (!handle) return

            /* Seeded here too, not only in `open`: this also runs when the card is re-read after
             * an edit, where there is no click to have seeded from. */
            const seed = seedFor(handle)

            set((state) => {
                state.currentHandle = handle
                state.current = seed
                /* Ready as soon as *something* is renderable, which is what suppresses the
                 * skeleton — the fetch below then replaces it silently. */
                state.ready = seed !== null
                state.error.detail = false
                state.loading.detail = true
            })

            try {
                const profile = await api.get(API_ENDPOINTS.PROFILE(handle))
                set((state) => {
                    if (state.currentHandle !== handle) return
                    state.current = profile
                    state.ready = true
                })
            } catch (error) {
                set((state) => {
                    if (state.currentHandle !== handle) return
                    /* A failed *refresh* of something already on screen is not worth
                     * interrupting the reader for, and must not blank it — the seeded copy is
                     * still true. Only a load with nothing behind it resolves to not-found. */
                    if (state.current === null) {
                        state.error.detail = toErrorList(error, "Could not load that profile.")
                    }
                    state.ready = true
                })
            } finally {
                set((state) => {
                    if (state.currentHandle === handle) state.loading.detail = false
                })
            }
        },

        /* Follows or unfollows somebody, optimistically, from wherever the button was tapped.
         *
         * The person is named by handle because that is what both surfaces hold, and `id` is
         * what the *list* is keyed by — so the row patch needs the id, which only the loaded
         * copy of the person can supply. `person` is therefore passed in whole rather than
         * looked up: a row in a follow list is a person this store has never fetched.
         *
         * Three copies of one fact can be on screen at once and all three move together:
         *
         *   - the open profile's own button and follower count, if this is that person;
         *   - the open profile's *following* count, when the viewer is reading their own —
         *     following somebody from inside your own list has to lengthen it;
         *   - the row in whatever follow list is open over them.
         *
         * The optimistic shape is the app's usual one: snapshot, apply everywhere, reconcile
         * against the server's `{ following, followers }`, restore the snapshot on failure. The
         * count is taken from the response rather than from the guess, because somebody else
         * may have followed the same person in the meantime. */
        toggleFollow: async (person) => {
            const handle = person?.handle
            const profileId = person?.id
            if (!handle || !profileId || person.isSelf) return

            const wasFollowing = Boolean(person.following)
            const wasFollowers = Number(person.followers ?? 0)
            const guess = {
                following: !wasFollowing,
                followers: wasFollowers + (wasFollowing ? -1 : 1),
            }

            /* What has been written so far, so the viewer's own tally moves by the *change*
             * rather than by the direction of the value being written. `apply` runs twice on
             * the happy path — the guess, then the server's confirmation of it — and a delta
             * taken from the value alone would count the same follow twice. */
            let applied = wasFollowing

            const apply = (values) => {
                const delta = (values.following ? 1 : 0) - (applied ? 1 : 0)
                applied = values.following

                set((state) => {
                    if (state.current?.id === profileId) Object.assign(state.current, values)
                    /* The viewer's own *following* tally, when the profile on screen is theirs
                     * — following somebody from your own list has to lengthen it. */
                    if (delta !== 0 && state.current?.isSelf && state.current.id !== profileId) {
                        state.current.followingCount = Math.max(
                            0,
                            (state.current.followingCount ?? 0) + delta,
                        )
                    }
                })
                useFollowsStore.getState().patchRow(profileId, { following: values.following })
            }

            apply(guess)
            haptic()

            try {
                const result = await api.post(API_ENDPOINTS.PROFILE_FOLLOW(handle))
                apply(result)
            } catch (error) {
                apply({ following: wasFollowing, followers: wasFollowers })
                set((state) => {
                    state.error.follow = toErrorList(error, "Could not update that follow.")
                })
            }
        },

        reset: () => set(() => ({ ...INIT })),
        clearErrors: () =>
            set((state) => {
                state.error = ERROR_INIT
            }),
    })),
)

export default useStore
