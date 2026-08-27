import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS } from '@/lib/constants'
import {
    clearPushNotifications,
    deletePushToken,
    ensurePushChannel,
    pushPermission,
    pushPlatform,
    pushSupported,
    pushToken,
    requestPushPermission,
} from '@/lib/push'
import useNotificationsStore from '@/lib/store/notifications/store'
import { toErrorList } from '@/lib/utils'

/* This installation's standing with the OS and with FCM: may we push, what is our token, and
 * has the server been told about it.
 *
 * **Holds no remote collection.** Like `uploads`, this is a write path with some flags — the
 * notifications it delivers live in the `notifications` store, and nothing here duplicates
 * them. A push is one *delivery* of a row that already exists; see the header of
 * `lib/server/notifications.service.js`.
 *
 * ── Two entry points, and the difference matters ─────────────────────────────
 *
 * `sync()` is the quiet one and runs on every sign-in. It registers the token **only if
 * permission has already been granted**, so it can never cause a prompt. That is what makes
 * it safe to fire from boot alongside every other authorized store.
 *
 * `enable()` is the loud one and must only ever be reached from a deliberate tap. iOS shows
 * its system prompt exactly once per install and a refusal is final until the person digs
 * through Settings, so the prompt is spent, once, on somebody who has said they want this —
 * not on the splash screen before they have seen a single notification worth having.
 *
 * ── Why the token is re-registered rather than remembered ────────────────────
 *
 * There is no persistence here and there should not be. FCM rotates tokens on reinstall, on a
 * restore to a new handset, and on its own schedule; a token cached on this side is a claim
 * about a value the SDK owns. `sync()` asks for the current one every launch and POSTs it,
 * and the server's upsert makes that idempotent — one statement, on a path that already
 * happens once per session. */

const ERROR_INIT = {
    enable: false,
}

const LOADING_INIT = {
    enable: false,
}

const INIT = {
    error: ERROR_INIT,
    loading: LOADING_INIT,

    /* "granted" | "denied" | null, where null means the OS has never been asked — the one
     * state in which prompting would actually show a prompt. */
    permission: null,
    /* The FCM token currently registered with the API, or null. */
    token: null,

    /* A post id from a banner tapped before the app could route anywhere.
     *
     * A cold launch replays the tap that started the process, which arrives well before the
     * session is resolved and the shell is mounted. Navigating then would push a history
     * entry the router discards a moment later — or worse, land a signed-out viewer on a post
     * and bounce them to /login having thrown the destination away. So it is parked here and
     * the hook flushes it once there is somewhere to go. */
    pending: null,
}

const useStore = create(immer((set, get) => ({
    ...INIT,

    /* Boot. Never prompts — see the header. Called from `initAuthorizedStores`, so it runs
     * once per sign-in on every device, including the browsers where push does not exist and
     * this resolves immediately to nothing. */
    init: async () => {
        if (!pushSupported()) return

        /* Before anything can be delivered, and unconditionally — the channel has to exist
         * whether or not permission has been granted yet, because the grant may happen later
         * in the same session (the welcome step, or Settings) and the first push after it
         * would otherwise name a channel that is not there. Android-only and idempotent. */
        await ensurePushChannel()

        const permission = await pushPermission()
        set(state => { state.permission = permission })

        if (permission === 'granted') await get().sync()
    },

    /* Reads the current token off the SDK and tells the API about it.
     *
     * Silent on failure. A device that could not produce a token — a simulator with no APNs,
     * an Android build with no Play Services, a network fault — is a device that does not
     * receive pushes, and there is nothing the reader could do about it. Interrupting them to
     * say so would be noise about a feature they did not invoke. */
    sync: async () => {
        const token = await pushToken()
        if (!token) return

        try {
            await api.post(API_ENDPOINTS.DEVICES, { token, platform: pushPlatform() })
            set(state => { state.token = token })
        } catch {
            /* Left unregistered. The next launch calls `sync` again. */
        }
    },

    /* The deliberate ask. Fire from a tap and nowhere else.
     *
     * Returns whether push is now on, so the caller can say something useful about a refusal
     * — which is a state the app cannot get out of on its own, and therefore the one thing
     * here worth telling somebody about. */
    enable: async () => {
        if (!pushSupported()) return false

        set(state => { state.loading.enable = true })
        try {
            /* Again here, and not only in `init`. This is reachable from the welcome step,
             * which can run before `init` has resolved — and a grant whose first push names a
             * channel that was never created is a push that is silently not shown. */
            await ensurePushChannel()

            const granted = await requestPushPermission()
            set(state => { state.permission = granted ? 'granted' : 'denied' })

            if (granted) await get().sync()
            return granted
        } catch (error) {
            set(state => {
                state.error.enable = toErrorList(error, 'Could not turn on notifications.')
            })
            return false
        } finally {
            set(state => { state.loading.enable = false })
        }
    },

    /* Detaches this device on the way out of a session.
     *
     * **Ordered, and the order is the whole point.** The DELETE needs a live bearer token, so
     * it has to happen *before* `supabase().auth.signOut()` — which is why `logout` in the
     * auth store awaits this rather than leaving it to the global reset.
     *
     * `remote: false` is the expired-session path. There the session is already gone, so the
     * DELETE would earn a 401 — and a 401 is not free: `lib/api.js` answers one by calling
     * `expire()`, which is what called this in the first place. The re-entry terminates on
     * `expire`'s own `loggedIn` guard, but firing a request that can only fail in order to
     * bounce off a guard is not a thing to do on purpose.
     *
     * The local half always runs. `deletePushToken` invalidates the token at FCM, so a row
     * that outlived its session — an expiry, an offline sign-out, a killed app — starts
     * earning UNREGISTERED on the next send and is pruned then. That is the self-healing path
     * for every detach the API never heard about, and it is what keeps a shared phone from
     * buzzing with the previous person's likes. */
    unregister: async ({ remote = true } = {}) => {
        const { token } = get()

        if (token && remote) {
            try {
                await api.delete(API_ENDPOINTS.DEVICES, { token })
            } catch {
                /* The local delete below is the fallback. */
            }
        }

        await deletePushToken()
        set(state => { state.token = null })
    },

    /* A banner was tapped. Records where it wants to go; it does not go there.
     *
     * **The navigation belongs to the hook, not here**, and not only for layering's sake: a
     * cold launch replays its tap before the session has resolved and before anything is
     * mounted, so there is frequently nowhere to navigate *to* at the moment this runs.
     * Parking the destination and letting `usePushListeners` open it once `ready` is the same
     * mechanism in both cases, rather than a navigation with a fallback bolted on.
     *
     * The tally is refreshed regardless. The reader is arriving at the app *because* of a
     * notification, so the bell is certainly behind — this is the moment the notifications
     * store's header describes as the gap push closes. */
    openFromPush: (postId) => {
        useNotificationsStore.getState().refreshUnread()
        clearPushNotifications()

        if (postId) set(state => { state.pending = postId })
    },

    /* Consumes the parked destination, or null. Called by the hook once there is somewhere
     * to go; clearing it here rather than after the navigation is what stops a re-render
     * from opening the same post twice. */
    takePending: () => {
        const { pending } = get()
        if (pending) set(state => { state.pending = null })
        return pending
    },

    /* Deliberately keeps nothing. `unregister` is called *before* this on the sign-out path,
     * and the reset is what clears the token it left behind. */
    reset: () => set(() => ({ ...INIT })),
    clearErrors: () => set(state => { state.error = ERROR_INIT }),
})))

export default useStore
