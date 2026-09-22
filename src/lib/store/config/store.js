import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"

import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/constants"
import useMessagesStore from "@/lib/store/messages/store"

/* The app's feature flags, as the client holds them: what is switched on, and which builds are
 * still allowed to run.
 *
 * ── Not scoped to a viewer, and not cleared with one ─────────────────────────
 *
 * Every other store here holds something about a person or a parish, and `reset` empties it at
 * sign-out. This one holds a fact about the deployment, so it is deliberately absent from that
 * sweep: the version floor has to stand in front of the login screen as firmly as it stands in
 * front of the feed, and a build too old to run does not become fit to run by signing out of
 * it. `GET /api/config` asks for no session for the same reason.
 *
 * ── Persisted, so a second launch never guesses ──────────────────────────────
 *
 * The flags are read over the network, so a launch that did not remember them would spend its
 * first frames on the optimistic defaults — showing the Messages entrance to a parish that has
 * messaging switched off, and letting a build below the floor open the app before the wall
 * arrives. Holding the last answer on disk, like `auth` holds `loggedIn` and `org` holds its
 * selection, makes every launch after the first correct on frame one and turns the fetch into
 * confirmation rather than discovery.
 *
 * That is why `onRehydrateStorage` pushes the switch into `messages` as well: the value being
 * right in this store a frame before anything reads it is the whole point of keeping it.
 *
 * ── Failing open, and what that means for a client that has heard ────────────
 *
 * There is no `error` here and this store is absent from `useErrors`, like `fasting`. A flag
 * that could not be read is not something to apologise to a parishioner for; it is something to
 * behave as though had never been set. A client that has **never** had an answer runs on the
 * defaults below, which turn nothing off and wall nobody out; a client that has one keeps it,
 * because the last thing the deployment said is a better guess than an optimistic one. The
 * server takes the same direction for the same reason; see `lib/server/config.js`.
 *
 * ── One arrow out ────────────────────────────────────────────────────────────
 *
 * `config` → `messages`, `setEnabled`. Messaging's gates are already a single pair of flags in
 * that store, read by the nav, the inbox, the thread and the send icon, so pushing the switch
 * into it closes all five at once — where folding the flag into each hook would leave the
 * closing of a door to be remembered five times. Same shape as `messages` → `notifications`'
 * `setMessagesTally`. */

const INIT = {
    /* Whether the flags have been asked for **this session**, win or lose — not whether the
     * answer arrived, and never restored from disk. The same distinction `booted` draws in the
     * messages store, and what anything that would otherwise fire a request into a switched-off
     * feature waits on. A read that failed still raises it, or an offline launch would be a
     * launch with every feature withheld. */
    settled: false,
    /* The same values the server falls back to, so a client that has never heard behaves
     * exactly like a deploy with no Remote Config at all. */
    messagingEnabled: true,
    /* The oldest version still allowed to run, or null for no floor. Compared against
     * `APP_VERSION` by `useUpdateRequired`, which is also where it is confined to native — a
     * browser is always holding whatever the deploy just served it. */
    minimumVersion: null,
}

const useStore = create(
    immer(
        persist(
            (set, get) => ({
                ...INIT,

                /* Reads the flags. Called on boot, on every return to the foreground, and on
                 * regaining a connection, all ungated by the session. Never throws and never
                 * reports: see the header. */
                load: async () => {
                    let flags = null
                    try {
                        flags = await api.get(API_ENDPOINTS.CONFIG)
                    } catch {
                        /* Whatever is in hand still stands; only the waiting ends. */
                        set((state) => {
                            state.settled = true
                        })
                        return
                    }

                    set((state) => {
                        /* Anything but an explicit `false` is on. A deploy whose Remote Config
                         * has no such parameter, or whose server could not read it, answers with
                         * the default — and a missing value must never read as a feature being
                         * withdrawn. */
                        state.messagingEnabled = flags?.messagingEnabled !== false
                        state.minimumVersion =
                            typeof flags?.minimumVersion === "string"
                                ? flags.minimumVersion
                                : null
                        state.settled = true
                    })

                    useMessagesStore.getState().setEnabled(get().messagingEnabled)
                },
            }),
            {
                name: "grapevine-config",
                /* `settled` is about this session and must not survive one, or a client would
                 * open believing it had already asked. */
                partialize: (state) => ({
                    messagingEnabled: state.messagingEnabled,
                    minimumVersion: state.minimumVersion,
                }),
                /* The restored switch has to reach `messages` before anything renders off it,
                 * which is the point of persisting it at all. */
                onRehydrateStorage: () => (state) => {
                    if (state) useMessagesStore.getState().setEnabled(state.messagingEnabled)
                },
            },
        ),
    ),
)

export default useStore
