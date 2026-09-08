"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useShallow } from 'zustand/react/shallow'

import {
    ACCESS,
    CLERGY_VOCATIONS,
    OTP_RESEND_SECONDS,
    PLATFORM_ROLES,
    RANKED_VOCATIONS,
    ROLE_LEVEL,
    ROLES,
    ROUTES,
    UPLOAD_PURPOSES,
    VOCATIONS,
} from "@/lib/constants"
import { useNow } from "@/lib/hooks/useNow.hook"
import { isNative, onAppState } from "@/lib/native"
import { suggestDisplayName } from "@/lib/name"
import { useUpload } from "@/lib/store/uploads/hook"
import useAuthStore, { viewerAuthor } from "./store"

/* The login form's whole surface: request a code, then verify it.
 *
 * Two steps, one hook, because they are one flow and the second needs the address the
 * first used — which the store holds as `pendingEmail`, so the form never has to carry it
 * across a re-render or a remount. `stage` is derived from that rather than being a
 * separate piece of state, so the two can't disagree. */
export const useLogin = () => {
    const [
        requestCode,
        verifyCode,
        cancelCode,
        pendingEmail,
        codeSentAt,
        loadingRequest,
        loadingVerify,
        errorRequest,
        errorVerify,
        loggedIn,
        init,
        clearError,
    ] = useAuthStore(useShallow(state => ([
        state.requestCode,
        state.verifyCode,
        state.cancelCode,
        state.pendingEmail,
        state.codeSentAt,
        state.loading.request,
        state.loading.verify,
        state.error.request,
        state.error.verify,
        state.loggedIn,
        state.init,
        state.clearError,
    ])))
    const router = useRouter()

    /* Ticks every second so the resend countdown actually counts down. Cheap, and only
     * while the login screen is mounted. */
    const now = useNow(1000)

    useEffect(() => {
        init()
    }, [init])

    /* The router is handed to the store action, which redirects after the session and the
     * profile are both in place — keeping the navigation next to the state change that
     * justifies it. */
    const verify = useCallback(
        (code) => verifyCode(code, router),
        [verifyCode, router],
    )

    /* Re-sends to the address already awaiting a code. */
    const resend = useCallback(
        () => requestCode(pendingEmail),
        [requestCode, pendingEmail],
    )

    /* Seconds left before Supabase will accept another code for this address. It enforces
     * one OTP request per user per 60 seconds, so resending inside that window is a
     * guaranteed failure — the button waits it out instead of surfacing an error the user
     * can do nothing about. */
    const resendIn = useMemo(() => {
        if (!codeSentAt) return 0
        const elapsed = Math.floor((now - codeSentAt) / 1000)
        return Math.max(0, OTP_RESEND_SECONDS - elapsed)
    }, [codeSentAt, now])

    return useMemo(() => ({
        stage: pendingEmail ? "code" : "email",
        email: pendingEmail,
        requestCode,
        verify,
        resend,
        resendIn,
        back: cancelCode,
        loading: loadingRequest || loadingVerify,
        error: errorRequest || errorVerify,
        loggedIn,
        clearError: () => {
            clearError("request")
            clearError("verify")
        },
    }), [
        pendingEmail, requestCode, verify, resend, resendIn, cancelCode,
        loadingRequest, loadingVerify, errorRequest, errorVerify, loggedIn, clearError,
    ])
}

/* Orientation: submit the answers, and the viewer comes back onboarded.
 *
 * The updated viewer replaces the store's copy directly rather than triggering a re-fetch
 * — `onboardedAt` is what the gate reads, so any gap between "saved" and "the client knows
 * it saved" is a gap where the viewer sits on a completed form. */
export const useOnboarding = () => {
    const [user, completeOnboarding, checkHandle, loading, error, clearError] = useAuthStore(
        useShallow(state => ([
            state.user,
            state.completeOnboarding,
            state.checkHandle,
            state.loading.onboarding,
            state.error.onboarding,
            state.clearError,
        ])),
    )
    const router = useRouter()

    const submit = useCallback(
        (values) => completeOnboarding(values, router),
        [completeOnboarding, router],
    )

    return useMemo(() => ({
        user,
        submit,
        /* Passed straight through. The result is per-keystroke and belongs to the step that
         * asked, so it is held there in local state rather than in the store. */
        checkHandle,
        loading,
        error,
        clearError: () => clearError("onboarding"),
    }), [user, submit, checkHandle, loading, error, clearError])
}

/* Changing the viewer's profile picture, as one call for the surface that offers it.
 *
 * The two halves stay in their own stores — `uploads` gets the bytes into storage, `auth`
 * persists the URL and takes the updated viewer — and this hook is where they meet, the same
 * way the composer pairs `useUpload` with `usePublish`. Doing it here rather than inside the
 * auth store is what keeps avatars on the one upload path every other file in the app uses.
 *
 * `busy` covers both legs, because to the person waiting they are one action: the photo is
 * not theirs until the second one lands, and a control that re-enabled between them would
 * invite a second pick against a profile still holding the old picture.
 *
 * Failures are already parked by whichever store owned the leg that failed, and toasted by
 * `useErrorListener`, so this only reports whether it worked. */
export const useAvatarUpload = () => {
    const [setAvatar, saving] = useAuthStore(
        useShallow(state => ([state.setAvatar, state.loading.avatar])),
    )
    const { upload, uploading } = useUpload(UPLOAD_PURPOSES.AVATAR)

    const pick = useCallback(
        async (files) => {
            const [uploaded] = await upload(files)
            /* The upload already parked and toasted its own failure; stopping here is what
             * keeps a failed transfer from clearing the picture that is still perfectly
             * good. */
            if (!uploaded) return false
            return setAvatar(uploaded.url)
        },
        [upload, setAvatar],
    )

    return useMemo(
        () => ({ pick, busy: uploading || saving }),
        [pick, uploading, saving],
    )
}

/* The edit half of the viewer's own profile page — the values the form seeds from, the two
 * vocation questions that decide which fields are drawn, and the save.
 *
 * **The whole form in one hook, because it is one write.** Name, handle, birthday and the
 * parish facts all land in `PATCH /api/me` and all come back as one viewer, so splitting them
 * across hooks would only give the page several ways to be half-saved.
 *
 * The three vocation flags are answered here rather than in the page because they are facts
 * about the viewer, not about the layout: a catechumen has not been given a patron saint yet,
 * a layman has no ordination, and nobody unranked needs telling what to be called. They shape
 * the form only — `updateProfile` accepts every field from anybody, so a reader ordained a
 * deacon needs a vocation change and nothing else.
 *
 * `checkHandle` is passed straight through from the store, the same way orientation consumes
 * it: the answer is per-keystroke and belongs to the field that asked, so it is held in local
 * state there rather than in the store. */
export const useProfileEditor = () => {
    const [user, saveProfile, checkHandle, saving] = useAuthStore(
        useShallow(state => ([
            state.user,
            state.saveProfile,
            state.checkHandle,
            state.loading.details,
        ])),
    )

    return useMemo(
        () => ({
            /* Every field the form binds, defaulted to "" rather than null — an uncontrolled
             * input that later becomes controlled is a React warning and a lost keystroke. */
            values: {
                firstName: user?.firstName ?? "",
                lastName: user?.lastName ?? "",
                handle: user?.handle ?? "",
                birthday: user?.birthday ?? "",
                /* Seeded from the suggestion when the column is null, so somebody who
                 * onboarded before this field existed opens the form on the name they are
                 * already shown under rather than on an empty box that reads as having no
                 * name. Saving it is what makes it theirs. */
                displayName: user?.displayName || suggestDisplayName(user) || "",
                patronSaint: user?.patronSaint ?? "",
                nameDay: user?.nameDay ?? "",
                ordinationDate: user?.ordinationDate ?? "",
            },
            /* The viewer themselves, for `<AvatarPicker/>` — it draws the current picture and
             * falls back to initials and the handle's gradient, none of which `values` carries. */
            person: user,
            email: user?.email ?? "",
            catechumen: user?.vocation === VOCATIONS.CATECHUMEN,
            clergy: CLERGY_VOCATIONS.includes(user?.vocation),
            /* Who is asked what to be called. A layman is called what his name is, so the
             * field would be a box asking him to retype it. */
            ranked: RANKED_VOCATIONS.includes(user?.vocation),
            checkHandle,
            save: saveProfile,
            saving,
        }),
        [user, saveProfile, checkHandle, saving],
    )
}

/* Saving a group's own details — the auth store's half of the group-settings surface.
 *
 * Lives here rather than in the org store for the reason the write itself does: `user.orgs`
 * is the single copy of the viewer's groups, so the store that owns that list is the store
 * that swaps the updated row back in. The org store holds only the *selection* and which
 * group is open in the editor.
 *
 * Exposed as a hook so `useOrgSettings` has something to consume: hooks are the only layer
 * that touches a store, and a cross-domain read that reaches for `useAuthStore` directly
 * would be the one place in the app that skips it. */
export const useUpdateOrg = () => {
    const [updateOrg, saving] = useAuthStore(
        useShallow(state => ([state.updateOrg, state.loading.org])),
    )

    return useMemo(() => ({ updateOrg, saving }), [updateOrg, saving])
}

/* Creating a group — the auth store's half of the create surface, for the same reason
 * `useUpdateOrg` is its half of the editor: the write lands in `user.orgs`. */
export const useCreateOrg = () => {
    const [createOrg, creating] = useAuthStore(
        useShallow(state => ([state.createOrg, state.loading.org])),
    )

    return useMemo(() => ({ createOrg, creating }), [createOrg, creating])
}

/* Deleting a group — the auth store's half of the danger zone, for the reason the other two
 * group writes live there: the row comes off `user.orgs`. */
export const useDeleteOrg = () => {
    const [deleteOrg, deleting] = useAuthStore(
        useShallow(state => ([state.deleteOrg, state.loading.orgDelete])),
    )

    return useMemo(() => ({ deleteOrg, deleting }), [deleteOrg, deleting])
}

/* Whether the viewer may create groups — the third axis, and **not** a rank above ADMIN.
 *
 * Deliberately its own hook rather than a value threaded through `usePrivileged`: that one
 * walks `ROLE_LEVEL` and answers "may I act in this group", which is a question about a
 * membership. This one is about the person and has no group in it at all, so putting OWNER on
 * that ladder would make every `<Privileged/>` in the app start answering it.
 *
 * Presentation only. It decides whether an entrance is drawn; `requirePlatformOwner` on the
 * server decides whether the call succeeds. */
export const usePlatformOwner = () => {
    return useAuthStore(state => state.user?.platformRole === PLATFORM_ROLES.OWNER)
}

export const useLogout = () => {
    const logoutUser = useAuthStore(state => state.logout)
    const router = useRouter()

    const logout = useCallback(() => {
        logoutUser(router)
    }, [logoutUser, router])

    return useMemo(() => ({ logout }), [logout])
}

/* The signed-in viewer: profile, vocation, role, and groups. Null when signed out. */
export const useUser = () => {
    return useAuthStore(state => state.user)
}

/* The viewer's identity as a post/comment author — the shape the API stamps on the server.
 *
 * Used for the optimistic comment row, which has to render before the server has replied
 * with the authoritative resource. Built here so the projection lives in one place and the
 * optimistic row cannot render a different author than the one that comes back.
 *
 * The shape itself is `viewerAuthor` in the store, shared with the comments store, which
 * needs the same projection from a layer where no hook is available. */
export const useViewerAuthor = () => {
    return useAuthStore(useShallow(state => viewerAuthor(state.user)))
}

/* A sign-in callback sitting in the URL: `/#access_token=…&refresh_token=…`, which `init()`
 * has to be given the chance to consume before anything navigates, because a redirect
 * discards the fragment and the tokens with it.
 *
 * Read once at module load, which is ahead of the first render and of every navigation that
 * could clear it. Always false on native — `detectSessionInUrl` is off there and the boot
 * guard in app/layout.jsx has already rewritten the URL to the root. */
const CALLBACK = typeof window !== "undefined" && window.location.hash.includes("access_token")

/* Whether anyone is signed in, whether the session check has finished, and whether the gates
 * may act on the answer yet. Kept separate from useLogin so a consumer doesn't drag in the
 * login form's loading/error surface.
 *
 * **`settled` is the only one of the three a gate may render off, and `loggedIn` is never
 * handed out alone.** `loggedIn` rehydrates off disk before `init()` has asked Supabase
 * anything, so a consumer reading it bare acts on the persisted *guess* — which is how a push
 * tapped from a cold launch flushes its destination before <SlideRouter/> exists to receive
 * it. That caller wants `ready`.
 *
 * A gate wants something weaker, and this is where the two part company. A returning viewer's
 * `loggedIn` is on disk on the first render, while `ready` is three serial round trips away —
 * the storage read, a token refresh, and `/api/me` — and holding the shell shut for all of
 * them means the app cannot even *start* fetching a feed until they finish. So a persisted
 * session is treated as the answer it almost always is: the shell mounts on the first frame
 * and `init()` reconciles behind it, signing the viewer out on the spot if the session is
 * genuinely gone. The one case where the guess must not be acted on is a callback in the URL,
 * because the redirect it would authorize is what destroys the tokens. */
export const useAuthGate = () => {
    return useAuthStore(useShallow(state => ({
        ready: state.ready,
        loggedIn: state.loggedIn,
        settled: state.ready || (state.loggedIn && !CALLBACK),
    })))
}

/* Where a signed-in viewer belongs, as a route — or `null` for "the app", or `undefined`
 * for "not known yet".
 *
 * Three-valued on purpose. A gate that cannot tell "no redirect needed" from "the viewer
 * has not loaded" will bounce someone out of the app for the fraction of a second before
 * /api/me answers, and on a magic-link boot that is long enough to matter.
 *
 * Answered off the viewer alone, persisted copy included, for the reason `useAuthGate`
 * settles on the persisted session: a cached viewer knows its own access and whether
 * orientation is finished, and waiting for `/api/me` to confirm two fields that change once
 * in an account's life holds the shell shut for a round trip on every launch. `/api/me`
 * replaces the viewer when it lands, so a revoked membership or a finished orientation moves
 * the reader a moment later.
 *
 * This is the single source that both gates in components/MemberGate.jsx and the callback
 * scrub in useAuthInit read, so they cannot disagree and fight over the same navigation. */
export const useGatewayDestination = () => {
    return useAuthStore(state => {
        if (!state.loggedIn || !state.user) return undefined
        if (state.user.access !== ACCESS.ACTIVE) return ROUTES.ACCESS
        if (!state.user.onboardedAt) return ROUTES.WELCOME
        return null
    })
}

/* Keeps the session alive across the gaps when the app isn't running.
 *
 * A session does not usually die because it expired; it dies because nothing was awake to
 * renew it. A phone spends most of its life with this app suspended, its timers frozen and
 * its access token quietly ageing out, and the moment the reader taps the icon the first
 * request goes out on a token that expired in the night. So the shell tells the store when
 * it wakes, and the store renews before anything is asked of the API.
 *
 * Three signals, because no one of them covers the ground:
 *
 *   appStateChange   native, and the authoritative one — the OS saying the app is back.
 *   online           either target regaining a connection, which is when a viewer left on
 *                    a cached profile can finally be confirmed.
 *   visibilitychange web only. On native supabase-js's own visibility handling has already
 *                    been taken over (see `startAutoRefresh`), and doubling it up here
 *                    would just fire a second refresh at every wake.
 *
 * All three land on the same idempotent `resume()`, so overlapping wakes cost nothing. */
const useSessionResume = () => {
    const [resume, suspend] = useAuthStore(
        useShallow((state) => [state.resume, state.suspend]),
    )

    useEffect(() => {
        const offAppState = onAppState((active) => (active ? resume() : suspend()))

        const onOnline = () => resume()
        window.addEventListener("online", onOnline)

        const onVisible = () => {
            if (document.visibilityState === "visible") resume()
        }
        if (!isNative()) document.addEventListener("visibilitychange", onVisible)

        return () => {
            offAppState()
            window.removeEventListener("online", onOnline)
            document.removeEventListener("visibilitychange", onVisible)
        }
    }, [resume, suspend])
}

/* Boots the auth store. Mounted once by <App/>, which sits in the root layout *outside*
 * both route groups — so the session is resolved no matter which URL the app is opened at.
 *
 * It used to be called only by useLogin, which meant it ran only once the login page had
 * mounted. A cold load of any protected route therefore redirected first and asked
 * afterwards, and a magic-link callback lost its tokens to that redirect. */
export const useAuthInit = () => {
    const init = useAuthStore(state => state.init)
    const destination = useGatewayDestination()
    const router = useRouter()

    useEffect(() => {
        init()
    }, [init])

    useSessionResume()

    /* Scrub the magic-link callback out of the address bar.
     *
     * `/auth/v1/verify` hands the session back as `#access_token=…&refresh_token=…`.
     * supabase-js has read it by the time the session resolves, but the fragment stays in
     * the URL — and therefore in the address bar, in browser history, and in anything the
     * reader copies. A refresh token pasted into a chat is a live credential.
     *
     * **Only when nobody else is navigating.** This is gated on `destination === null`
     * ("the viewer stays where they are") because the gates in components/MemberGate.jsx
     * may be about to send them to /welcome or /access — and those navigations drop the
     * fragment for free. Scrubbing unconditionally means two `router.replace` calls racing
     * for the same tick: this one lands last, cancels the gate's redirect, and leaves the
     * viewer on a route the gate has already decided to render nothing for. That is a
     * blank page, and it is exactly what happened before this guard existed.
     *
     * `router.replace`, not `history.replaceState`: the App Router caches the URL it
     * booted with and restores the fragment on the next render that touches the router. */
    useEffect(() => {
        if (destination !== null) return
        if (typeof window === "undefined") return
        if (!window.location.hash.includes("access_token")) return
        router.replace(window.location.pathname + window.location.search)
    }, [destination, router])
}

/* The viewer's role in a given group, or in their primary group when no id is passed.
 *
 * Roles are per-group, so this always resolves against one: being an admin of a parish
 * grants nothing in another parish, and a hook that returned a single global "am I admin"
 * would quietly paper over that the moment a second group exists. */
export const useRole = (orgId) => {
    return useAuthStore(state => {
        if (!state.user) return null
        if (!orgId) return state.user.role
        return state.user.orgs?.find(org => org.id === orgId)?.role ?? null
    })
}

/* Whether the viewer meets or exceeds `role` in the given group. The comparison is
 * hierarchical via ROLE_LEVEL, so a control requiring MEMBER is satisfied by an ADMIN. */
export const usePrivileged = (role = ROLES.ADMIN, orgId) => {
    const current = useRole(orgId)
    return useMemo(() => {
        if (!current) return false
        return (ROLE_LEVEL[current] ?? 0) >= (ROLE_LEVEL[role] ?? 0)
    }, [current, role])
}

/* Whether the viewer meets `role` in **any** group they belong to.
 *
 * A different question from `usePrivileged`, not a convenience over it, and the two must not
 * be confused. That one answers "may I act *here*", which is what every control inside a
 * group asks. This answers "does this capability exist for me at all", which is what an
 * entrance asks — the compose button lives in the app's chrome, above the group switcher, and
 * an admin of one parish reading their diocese should still see it. What they then post
 * *into* is the composer's own question, and it is asked again per group at publish time.
 *
 * Reach for this only for an affordance that is genuinely outside a group's scope. Anything
 * rendered within one wants `usePrivileged(role, orgId)`. */
export const usePrivilegedAnywhere = (role = ROLES.ADMIN) => {
    return useAuthStore(state =>
        (state.user?.orgs ?? []).some(
            org => (ROLE_LEVEL[org.role] ?? 0) >= (ROLE_LEVEL[role] ?? 0),
        ),
    )
}
