import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { toast } from 'sonner'

import api from '@/lib/api'
import { API_ENDPOINTS, ERROR_CODES, ROLES, ROUTES } from '@/lib/constants'
import { isNative } from '@/lib/native'
import { startAutoRefresh, stopAutoRefresh, supabase } from '@/lib/supabase'
import useGlobalStore from '@/lib/store/global.store'
import { toErrorList } from '@/lib/utils'

/* Authentication, backed by Supabase.
 *
 * ── The flow ────────────────────────────────────────────────────────────────
 *
 *   requestCode(email)  → Supabase emails a one-time code (6 digits here; see OTP_LENGTH)
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
    onboarding: false,
    avatar: false,
    org: false,
}

const LOADING_INIT = {
    request: false,
    verify: false,
    logout: false,
    onboarding: false,
    avatar: false,
    org: false,
}

const INIT = {
    ready: false,
    error: ERROR_INIT,
    loading: LOADING_INIT,

    loggedIn: false,
    user: null,

    /* The viewer on screen came out of storage and has not been confirmed against
     * `/api/me` this session — the app booted with no usable network. Not an error state:
     * the cached viewer is almost certainly still accurate, and the alternative (signing
     * out) is strictly worse. `resume()` clears it the moment a request gets through. */
    stale: false,

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

/* Failures that say nothing about whether the viewer is still signed in.
 *
 * `NETWORK` is the request never completing; `UNAVAILABLE` is the API's own 503, which
 * `lib/server/auth.js` answers when it could not *run* the token check (a JWKS fetch that
 * timed out, a paused project) precisely so it does not have to lie and say 401; `INTERNAL`
 * is a bug on our side. None of them is a verdict on the session, so none of them may cost
 * someone theirs. A real 401 never reaches here — `lib/api.js` has already signed out. */
const TRANSIENT = new Set([
    ERROR_CODES.NETWORK,
    ERROR_CODES.UNAVAILABLE,
    ERROR_CODES.INTERNAL,
])

/* The viewer, in the shape the API stamps on a post or comment author.
 *
 * Optimistic rows render before the server has replied, and they must render as the *same*
 * person the reply will carry — otherwise a freshly posted comment visibly rewrites itself
 * a moment later. Defined once here because two callers need it from different layers:
 * `useViewerAuthor` (a hook, for components) and the comments store (plain state, no hook
 * available). Two copies of this drifted apart is exactly the bug it prevents.
 *
 * The name goes as parts, like every other author block — `displayName()` composes it.
 *
 * `verified` is the approximation: the server answers it against the organization the
 * content belongs to, and the viewer's role in their primary group is the closest a client
 * can get without an org id on the wire. Correct for a single-parish deployment, and
 * replaced by the authoritative row within the second regardless. */
export const viewerAuthor = (user) =>
    user
        ? {
              handle: user.handle,
              firstName: user.firstName,
              lastName: user.lastName,
              vocation: user.vocation,
              avatar: user.avatar,
              verified: user.role === ROLES.ADMIN,
          }
        : null

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
 * These used to collapse into one "Grapevine is invite-only — check with your parish
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
        return "We could not send a code to that address. Grapevine is invite-only — check with your parish administrator."
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
                        const { data, error } = await supabase().auth.getSession()

                        if (data.session) {
                            await get()._loadProfile()
                        } else if (error) {
                            /* A session is on disk but could not be refreshed — the app
                             * was opened with no network, or Supabase is unreachable. That
                             * is not a signed-out viewer and must not be treated as one:
                             * the persisted `loggedIn`/`user` stand, the app opens on its
                             * cached feed, and `resume()` reconciles when the connection
                             * comes back. See `sessionToken` in lib/supabase.js. */
                            set(state => { state.stale = state.loggedIn })
                        } else {
                            /* No session at all, but possibly a stale persisted
                             * `loggedIn: true` from a previous visit. Clear it, or the gate
                             * renders the shell for a viewer who cannot load anything. */
                            set(state => {
                                state.loggedIn = false
                                state.user = null
                                state.stale = false
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
                                            state.stale = false
                                        })
                                    }

                                    /* A token that came back after the app had been
                                     * running on a cached viewer — the connection
                                     * returned. Confirm the viewer now rather than making
                                     * the reader wait for the next foreground. */
                                    if (event === 'TOKEN_REFRESHED' && get().stale) {
                                        get()._loadProfile().catch(() => {})
                                    }
                                },
                            )
                            subscription = listener.subscription
                        }
                    } catch (error) {
                        /* Almost always `/api/me` failing. **What it failed with decides
                         * whether this is a sign-out**, and getting that wrong is how a
                         * cold start on a train ejects someone from the app: a network
                         * fault used to land here and clear the viewer outright, even
                         * though the session on disk was untouched and would have worked
                         * ten seconds later.
                         *
                         * A genuine 401 does not reach this branch — `lib/api.js` has
                         * already called `expire()` — so a transient code here means the
                         * question was never answered, and an unanswered question leaves
                         * the cached viewer exactly where it was. The one case that still
                         * has to sign out is a transient failure with nothing cached to
                         * fall back on: rendering the shell around a null viewer is a
                         * blank screen with no way forward. */
                        const transient = TRANSIENT.has(error?.code) && Boolean(get().user)

                        set(state => {
                            if (transient) {
                                state.stale = true
                                return
                            }
                            state.loggedIn = false
                            state.user = null
                            state.stale = false
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
                        state.stale = false
                    })
                },

                /* The app came back — foregrounded on a phone, or a tab regaining focus or
                 * a connection. Two jobs, and both exist because time passed while nothing
                 * was watching.
                 *
                 * 1. **Restart the token ticker (native only).** A suspended WebView's
                 *    timers are frozen, so an app asleep for two hours wakes with a token
                 *    that expired ninety minutes ago and a refresh loop that has not run
                 *    since. `startAutoRefresh` ticks immediately, which renews it before
                 *    the first request goes out rather than after one has already 401ed.
                 *    The web is left to supabase-js's own `visibilitychange` handling —
                 *    see the note on `startAutoRefresh`.
                 *
                 * 2. **Reconcile a viewer that was never confirmed.** Only when `stale`:
                 *    foregrounding is frequent and `/api/me` on every one of them would be
                 *    a request each time the reader glances at their phone, for
                 *    information that has not changed. A failure here is silent on purpose
                 *    — it means the connection is still down, the cached viewer is still
                 *    the best answer available, and the next resume tries again. */
                resume: async () => {
                    if (isNative()) startAutoRefresh()
                    if (!get().loggedIn || !get().stale) return
                    await get()._loadProfile().catch(() => {})
                },

                /* Backgrounded. Stops the refresh loop so one cannot be in flight when the
                 * OS freezes the app — see `stopAutoRefresh` for why that costs a session. */
                suspend: () => {
                    if (isNative()) stopAutoRefresh()
                },

                /* Is this @handle free? Asked while the viewer types one during
                 * orientation.
                 *
                 * Returns the answer instead of storing it, which is the exception this
                 * store makes to holding its own state: the result belongs to one keystroke
                 * on one step, and parking it here would mean a stale "taken" surviving in
                 * the persisted viewer long after the field that asked. The step holds it in
                 * local state; only the *outcome* — the saved handle — reaches the store.
                 *
                 * A failed check resolves as available rather than throwing. The check is
                 * advisory and the unique constraint is authoritative, so a network blip
                 * must not block someone on a handle that is probably fine — the submit
                 * still catches a real collision. */
                checkHandle: async (value) => {
                    try {
                        return await api.get(API_ENDPOINTS.ME_HANDLE, {
                            params: { value: String(value ?? "") },
                        })
                    } catch {
                        return { handle: String(value ?? ""), available: true, reason: null }
                    }
                },

                /* Finishes first-run orientation and lets the viewer into the app.
                 *
                 * The response is the whole updated viewer, so it replaces `user`
                 * outright — the gate reads `onboardedAt` off it, and re-fetching to learn
                 * what we were just told would leave the reader on a finished form. */
                completeOnboarding: async (values, router) => {
                    set(state => {
                        state.loading.onboarding = true
                        state.error.onboarding = false
                    })
                    try {
                        const user = await api.post(API_ENDPOINTS.ME_ONBOARDING, values)
                        set(state => { state.user = user })
                        router?.replace(ROUTES.DEFAULT)
                        return { ok: true }
                    } catch (error) {
                        set(state => {
                            state.error.onboarding = toErrorList(
                                error,
                                'Could not save your details. Please try again.',
                            )
                        })
                        /* `fields` is handed back rather than only toasted. The form asks
                         * its questions across several steps, so "which field" is also
                         * "which step to return to" — a handle taken between the live check
                         * and the write has to send the viewer back two screens, and a toast
                         * alone would leave them on a finished form with no idea where the
                         * problem is. See the API contract's failure shape. */
                        return { ok: false, fields: error?.fields ?? null }
                    } finally {
                        set(state => { state.loading.onboarding = false })
                    }
                },

                /* Replaces the viewer's profile picture with an already-uploaded object.
                 *
                 * **Takes a URL, not a file.** Getting bytes into storage is the `uploads`
                 * store's job for every purpose in the app, and the surface that collects the
                 * file calls it directly (see `useUpload`, and the composer that established
                 * the pattern). What is left for this store is the half that is genuinely
                 * about the viewer: persisting the URL and swapping in the profile that comes
                 * back. Doing the upload here as well would give avatars a private path that
                 * every other upload does not have.
                 *
                 * Not optimistic. The response *is* the new viewer, and it arrives one round
                 * trip after a photo has already been sent to storage — so there is nothing
                 * to be gained by guessing at it, and a picture that appeared and then
                 * reverted would be a worse answer than a spinner. */
                setAvatar: async (url) => {
                    if (!url) return false

                    set(state => {
                        state.loading.avatar = true
                        state.error.avatar = false
                    })
                    try {
                        const user = await api.patch(API_ENDPOINTS.ME, { avatar: url })
                        /* The whole viewer, so the nav's avatar, the profile header, and the
                         * face on the viewer's own optimistic comment rows all move at once. */
                        set(state => { state.user = user })
                        /* After the await, never before it. This write is not optimistic — the
                         * picture on screen is still the old one until the line above runs — so
                         * a toast raised alongside the request would be claiming something that
                         * had not happened yet. (The one place this app toasts early is a
                         * comment deletion, where the row disappears in the same frame; there is
                         * no such gesture to acknowledge here.) */
                        toast.success('Profile picture updated.')
                        return true
                    } catch (error) {
                        set(state => {
                            state.error.avatar = toErrorList(
                                error,
                                'Could not update your profile picture.',
                            )
                        })
                        return false
                    } finally {
                        set(state => { state.loading.avatar = false })
                    }
                },

                /* PATCH /api/orgs/:id → the group's name, description or picture.
                 *
                 * **This lives in the auth store because the auth store owns the groups.**
                 * `user.orgs` arrives with the viewer from `/api/me` and is the single copy
                 * the switcher, the Groups surface and `useCurrentOrg` all read — exactly as
                 * `user.avatar` is the single copy behind every face on screen. So a group
                 * edit is the same shape as `setAvatar`: PATCH, then swap the row that came
                 * back into the viewer. Putting it in the `org` store instead would have
                 * meant that store reaching into this one to invalidate a list it does not
                 * own, which is the cycle its header warns about.
                 *
                 * The row is replaced rather than the whole viewer refetched: the response is
                 * already the same projection `/me` ships, so a second round trip would learn
                 * nothing. Everything downstream re-renders because `orgs` is a new array —
                 * the name in the switcher, the picture beside it, and the header of the edit
                 * screen itself all move together. */
                updateOrg: async (orgId, changes) => {
                    if (!orgId) return false

                    set(state => {
                        state.loading.org = true
                        state.error.org = false
                    })
                    try {
                        const org = await api.patch(API_ENDPOINTS.ORG(orgId), changes)
                        set(state => {
                            const orgs = state.user?.orgs
                            if (!orgs) return
                            const index = orgs.findIndex(entry => entry.id === orgId)
                            if (index !== -1) orgs[index] = org
                        })
                        return true
                    } catch (error) {
                        set(state => {
                            state.error.org = toErrorList(
                                error,
                                'Could not save this group.',
                            )
                        })
                        return false
                    } finally {
                        set(state => { state.loading.org = false })
                    }
                },

                /* GET /api/me → the viewer. The single place `loggedIn` is set true. */
                _loadProfile: async () => {
                    const user = await api.get(API_ENDPOINTS.ME)
                    set(state => {
                        state.user = user
                        state.loggedIn = true
                        state.stale = false
                    })
                    return user
                },

                reset: () => set(() => ({ ...INIT })),
                clearError: (key) => set(state => { state.error[key] = false }),
                clearErrors: () => set(state => { state.error = ERROR_INIT }),
            }),
            {
                /* Only the cached view of "there is a session" survives a reload. The token
                 * is supabase-js's to persist (under its own `grapevine-auth` key), and
                 * duplicating it here would create a second copy to go stale. */
                partialize: (state) => ({
                    loggedIn: state.loggedIn,
                    user: state.user,
                }),
                name: 'grapevine-user',
            },
        ),
    ),
)

export default useStore
