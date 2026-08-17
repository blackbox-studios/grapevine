import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import api from '@/lib/api'
import { API_ENDPOINTS, ROUTES } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import useGlobalStore from '@/lib/store/global.store'
import { toErrorList } from '@/lib/utils'

/* Authentication, backed by Supabase.
 *
 * ── The flow ────────────────────────────────────────────────────────────────
 *
 *   requestCode(email)  → Supabase emails a one-time code (8 digits here; see OTP_LENGTH)
 *   verifyCode(code)    → a session exists; fetch /api/me; redirect
 *
 * **Why a code and not a magic link.** A link has to redirect somewhere, and a Capacitor
 * WebView has no origin for a provider to redirect back to — making one work needs a
 * custom URL scheme, the Capacitor Browser/App plugins, and a replay of the captured path
 * after mount, because the boot guard in `app/layout.jsx` rewrites any non-root URL to "/"
 * before hydration. A code needs none of that: the user types it into the same screen they
 * started on, so web and native run byte-identical paths. (The link in the same email
 * still works in a browser — `detectSessionInUrl` is on off-native.)
 *
 * **Why this is invite-only.** `signInWithOtp({ shouldCreateUser: false })`. Supabase
 * refuses to create an account, so an email with no `auth.users` row can never be sent a
 * code at all. The gate is in the provider, not in app code that could be bypassed — and
 * it means provisioning a user is the only way into the app.
 *
 * ── What the store holds ────────────────────────────────────────────────────
 *
 * Two different facts, deliberately not merged:
 *
 *   session  Supabase's — the token. Owned by supabase-js, persisted and refreshed by it,
 *            never copied into this store.
 *   user     the app's — profile, vocation, role, groups, from GET /api/me. A token proves
 *            identity; it says nothing about what this application knows about the person.
 *
 * `loggedIn` means "both of those are in place". Nothing renders the shell without it.
 *
 * `loggedIn`/`user` are persisted so a reload doesn't bounce a valid session to /login
 * while the session check is still in flight. It is a *cached view*, not the truth:
 * `init()` reconciles it against Supabase on every boot and signs out if the session is
 * gone. See auth-architecture.md. */

const ERROR_INIT = {
    request: false,
    verify: false,
    logout: false,
}

const LOADING_INIT = {
    request: false,
    verify: false,
    logout: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    loggedIn: false,
    user: null,

    /* The address a code was sent to. Drives the second step of the login form and is what
     * `resendCode` re-sends to, so the form never has to hold it. */
    pendingEmail: null,

    /* When the last code went out, as an epoch ms. Supabase allows one OTP request per
     * user per 60 seconds and rejects the rest, so the resend affordance has to wait that
     * window out rather than firing into a guaranteed error. */
    codeSentAt: null,
}

/* Guards against a second `onAuthStateChange` subscription on hot reload. */
let subscription = null

/* A sign-in link that failed comes back as an *error* in the URL fragment rather than a
 * session — `#error=access_denied&error_code=otp_expired&…`. supabase-js finds no tokens,
 * so nothing happens, and without this the viewer is bounced to the login screen with no
 * explanation at all. That is the single most common thing to go wrong with emailed links,
 * because they are one-shot: clicking twice, or a corporate mail scanner pre-fetching the
 * URL, spends the token before the human ever gets there.
 *
 * Read from the hash at boot, before the route gates redirect and take the fragment with
 * them. */
const readCallbackError = () => {
    if (typeof window === "undefined") return null

    const hash = window.location.hash.replace(/^#/, "")
    if (!hash.includes("error")) return null

    const params = new URLSearchParams(hash)
    const code = params.get("error_code")
    if (!code && !params.get("error")) return null

    if (code === "otp_expired") {
        return "That sign-in link has expired or was already used — links work only once. Request a new code below."
    }
    return (
        params.get("error_description")?.replace(/\+/g, " ") ??
        "That sign-in link is no longer valid. Request a new code below."
    )
}

/* Whether a failed send was a rate limit rather than a rejection of the address.
 *
 * This is the one failure that does *not* mean "you cannot sign in": a code sent minutes
 * ago is still valid for an hour, so the viewer may well be holding a working one. */
const isRateLimited = (error) =>
    error?.status === 429 ||
    error?.code === "over_email_send_rate_limit" ||
    error?.code === "over_request_rate_limit"

/* Why a code could not be sent.
 *
 * These used to collapse into one "Synaxis is invite-only — check with your parish
 * administrator" message, which is actively misleading for every cause except the one it
 * names: a rate-limited admin was told their own address was not recognised, and went
 * looking for a problem that did not exist.
 *
 * The invite-only wording is still deliberately vague about *which* address is unknown —
 * confirming that would turn the login form into a membership oracle for the parish — but
 * it is now only used when that is actually what happened. */
const requestFailureMessage = (error) => {
    const code = error?.code ?? ""
    const status = error?.status

    /* Supabase's built-in SMTP allows 2 messages an hour, project-wide, and only custom
     * SMTP can raise it. Saying so plainly beats implying the account is at fault. */
    if (isRateLimited(error)) {
        return "Too many sign-in emails have been sent recently. If you already have a code, enter it below — otherwise wait a few minutes and try again."
    }

    /* `shouldCreateUser: false` refusing an address with no account — the invite-only gate
     * doing its job. */
    if (code === "otp_disabled" || code === "signup_disabled" || status === 422) {
        return "We could not send a code to that address. Synaxis is invite-only — check with your parish administrator."
    }

    if (code === "validation_failed") {
        return "That does not look like a valid email address."
    }

    return "We could not send your sign-in code just now. Please try again in a moment."
}

const useStore = create(
    immer(
        persist(
            (set, get) => ({
                ...INIT,

                /* Boot. Reconciles the persisted optimistic view against the real session,
                 * then subscribes so a token refresh or a sign-out in another tab is
                 * reflected here.
                 *
                 * Idempotent: the login page and the gates both call it. */
                init: async () => {
                    if (get().ready) return

                    /* Read first, published last.
                     *
                     * Read now because the gates redirect the moment `ready` flips, and the
                     * fragment does not survive that navigation. Published in the `finally`
                     * rather than here because `useErrorListener` clears the error surface
                     * on its own mount pass — an error set synchronously inside this effect
                     * is wiped by that sweep before it can ever be toasted. */
                    const callbackError = readCallbackError()

                    try {
                        const { data } = await supabase().auth.getSession()

                        if (data.session) {
                            await get()._loadProfile()
                        } else {
                            /* No session, but possibly a stale persisted `loggedIn: true`
                             * from a previous visit. Clear it, or the gate renders the
                             * shell for a viewer who cannot load anything. */
                            set(state => {
                                state.loggedIn = false
                                state.user = null
                            })
                        }

                        if (!subscription) {
                            const { data: listener } = supabase().auth.onAuthStateChange(
                                (event) => {
                                    /* SIGNED_IN also fires on every token refresh, and
                                     * re-fetching the profile on each one would be a
                                     * request every hour for no new information. The
                                     * sign-in paths below load it explicitly instead. */
                                    if (event === 'SIGNED_OUT') {
                                        set(state => {
                                            state.loggedIn = false
                                            state.user = null
                                        })
                                    }
                                },
                            )
                            subscription = listener.subscription
                        }
                    } catch (error) {
                        set(state => {
                            state.loggedIn = false
                            state.user = null
                            if (!callbackError) {
                                state.error.verify = toErrorList(
                                    error,
                                    'Could not restore your session.',
                                )
                            }
                        })
                    } finally {
                        set(state => {
                            state.ready = true
                            if (callbackError) state.error.verify = [callbackError]
                        })
                    }
                },

                /* Step one: ask Supabase to email a code.
                 *
                 * `shouldCreateUser: false` is the invite-only gate — see the header. An
                 * unknown address fails here, and the message says so without confirming
                 * whether that specific address exists (which would turn the login form
                 * into a membership oracle for the parish). */
                requestCode: async (email) => {
                    const address = String(email ?? '').trim().toLowerCase()
                    if (!address) return false

                    set(state => {
                        state.loading.request = true
                        state.error.request = false
                    })

                    try {
                        const { error } = await supabase().auth.signInWithOtp({
                            email: address,
                            options: { shouldCreateUser: false },
                        })
                        if (error) throw error

                        set(state => {
                            state.pendingEmail = address
                            state.codeSentAt = Date.now()
                        })
                        return true
                    } catch (error) {
                        const rateLimited = isRateLimited(error)
                        set(state => {
                            state.error.request = toErrorList(error, requestFailureMessage(error))

                            /* Rate limited is the one failure that still advances to the
                             * code screen. A code lasts an hour, so someone who tapped
                             * twice in quick succession is very likely holding a valid one
                             * — stranding them on the email screen would throw it away and
                             * leave them waiting out a window for no reason. Every other
                             * failure (unknown address, malformed input) means there is no
                             * code to enter, so the form stays put.
                             *
                             * `codeSentAt` is stamped too, so the resend affordance counts
                             * down rather than letting them hammer straight back into the
                             * same limit. */
                            if (rateLimited) {
                                state.pendingEmail = address
                                state.codeSentAt = Date.now()
                            }
                        })
                        return rateLimited
                    } finally {
                        set(state => { state.loading.request = false })
                    }
                },

                /* Step two: exchange the code for a session, then load the app's own view
                 * of the person.
                 *
                 * The profile fetch is not optional. A verified token with no Profile row
                 * is a real state — an interrupted invite leaves one — and treating it as
                 * signed in would render a shell that 401s on everything. If /api/me
                 * fails, the Supabase session is torn back down so the viewer is cleanly
                 * signed out rather than stuck half-in. */
                verifyCode: async (code, router) => {
                    const email = get().pendingEmail
                    const token = String(code ?? '').trim()
                    if (!email || !token) return false

                    set(state => {
                        state.loading.verify = true
                        state.error.verify = false
                    })

                    try {
                        const { error } = await supabase().auth.verifyOtp({
                            email,
                            token,
                            type: 'email',
                        })
                        if (error) throw error

                        await get()._loadProfile()

                        set(state => {
                            state.pendingEmail = null
                            state.codeSentAt = null
                        })
                        router.replace(ROUTES.DEFAULT)
                        return true
                    } catch (error) {
                        /* Don't leave a Supabase session behind a failed app-level login. */
                        if (!get().loggedIn) {
                            await supabase().auth.signOut().catch(() => {})
                        }
                        set(state => {
                            state.error.verify = toErrorList(
                                error,
                                'That code is not valid. Check it and try again, or request a new one.',
                            )
                        })
                        return false
                    } finally {
                        set(state => { state.loading.verify = false })
                    }
                },

                /* Back to step one — clears the code screen without signing anything out. */
                cancelCode: () => set(state => {
                    state.pendingEmail = null
                    state.codeSentAt = null
                    state.error.verify = false
                    state.error.request = false
                }),

                logout: async (router) => {
                    set(state => { state.loading.logout = true })
                    try {
                        await supabase().auth.signOut()
                    } catch {
                        /* A failed sign-out still has to clear the client, or the viewer is
                         * stuck signed in with no way out. The token expires on its own. */
                    } finally {
                        useGlobalStore.getState().reset()
                        set(state => {
                            state.ready = true
                            state.loading.logout = false
                        })
                        router.replace(ROUTES.PUBLIC.LOGIN)
                    }
                },

                /* The session died mid-use — called by `lib/api.js` on any 401.
                 *
                 * No router here: this fires from inside a fetch, which can be anywhere,
                 * and the route gates already redirect the moment `loggedIn` goes false.
                 * Pushing a navigation from a data layer would race them. */
                expire: () => {
                    if (!get().loggedIn) return
                    supabase().auth.signOut().catch(() => {})
                    useGlobalStore.getState().reset()
                    set(state => {
                        state.ready = true
                        state.loggedIn = false
                        state.user = null
                    })
                },

                /* GET /api/me → the viewer. The single place `loggedIn` is set true. */
                _loadProfile: async () => {
                    const user = await api.get(API_ENDPOINTS.ME)
                    set(state => {
                        state.user = user
                        state.loggedIn = true
                    })
                    return user
                },

                reset: () => set(() => ({ ...INIT })),
                clearError: (key) => set(state => { state.error[key] = false }),
                clearErrors: () => set(state => { state.error = ERROR_INIT }),
            }),
            {
                /* Only the cached view of "there is a session" survives a reload. The token
                 * is supabase-js's to persist (under its own `synaxis-auth` key), and
                 * duplicating it here would create a second copy to go stale. */
                partialize: (state) => ({
                    loggedIn: state.loggedIn,
                    user: state.user,
                }),
                name: 'synaxis-user',
            },
        ),
    ),
)

export default useStore
