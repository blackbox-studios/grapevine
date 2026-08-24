import { Preferences } from "@capacitor/preferences"
import { createClient } from "@supabase/supabase-js"

import { isNative } from "@/lib/native"

/* The browser Supabase client — the only Supabase surface the app bundle may import.
 * (`lib/server/supabase.js` is the server pair, and it is behind `server-only` because it
 * can hold the service role key.)
 *
 * **This is the browser client on purpose, and it is the whole reason the native build
 * still works.** Supabase's Next.js guide is written around `@supabase/ssr`: a
 * `createServerClient` and a `middleware.ts` that refreshes the session cookie on every
 * request. None of that survives `output: "export"` — Next drops middleware silently, with
 * no error at build time and none at runtime, so following that guide ships an app with no
 * session refresh and no auth gate, and nothing tells you. See the "Adding a library"
 * section of native-architecture.md.
 *
 * The browser client needs no server at all: it keeps the session in localStorage and
 * refreshes the access token on a timer by itself. That is the same model the app's auth
 * store already used, which is why swapping the mock for this one changed the store and
 * nothing above it. */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL

/* The client-side key.
 *
 * Supabase replaced the JWT-style `anon` key with the publishable key
 * (`sb_publishable_...`); `anon` is the legacy form and is deprecated at the end of 2026.
 * Both are accepted so an older project keeps working, with the new one preferred — but
 * new projects should set only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
 *
 * Either way this key is public by design: it is compiled into the JS bundle and into the
 * native app binary, and it grants nothing on its own. What stops it being useful to an
 * attacker is that the Data API has no privileges on our tables — see
 * `prisma/policies.sql`. Never put a secret (`sb_secret_...`) or the `service_role` key
 * behind a `NEXT_PUBLIC_` name; that prefix is what ships it to the browser. */
const ANON_KEY =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/* Missing configuration is a developer error, not a runtime condition to handle — but it
 * must not crash the module graph at import time, or every page in the app white-screens
 * instead of the login form telling you what's wrong. So the client is created lazily and
 * the check happens on first use. */
let client = null

/* ------------------------------------------------------------------------- */
/* Where the session lives on native                                         */
/* ------------------------------------------------------------------------- */

const STORAGE_KEY = "synaxis-auth"

/* `localStorage`, defensively. A WebView can refuse it outright (private mode, a storage
 * quota exception), and a throw here would take the whole auth client down with it. */
const local = {
    get: (key) => {
        try {
            return window.localStorage.getItem(key)
        } catch {
            return null
        }
    },
    remove: (key) => {
        try {
            window.localStorage.removeItem(key)
        } catch {
            /* nothing to do — the copy we care about is in Preferences */
        }
    },
}

/* The session store for the native app, and the single most important reason a phone stays
 * signed in.
 *
 * supabase-js defaults to `localStorage`, which in a browser is durable enough — but inside
 * a WebView it is *website data*, and both platforms treat website data as a cache they may
 * reclaim. iOS purges `WKWebView` storage under disk pressure and can drop it when the app
 * is updated or offloaded; Android's WebView data goes with a "clear cache" and with some
 * OEM storage managers. None of that is an error the app can catch: the session is simply
 * gone on next launch and the reader is standing at a login screen they had no reason to
 * expect, in an app that is meant to behave like every other social app on the phone and
 * sign them in exactly once.
 *
 * Capacitor's Preferences plugin writes to `UserDefaults` on iOS and `SharedPreferences` on
 * Android. That is *application* data, not website data: it survives an update, a WebView
 * cache clear, and every eviction pass, and it goes away only when the app is uninstalled
 * or its data is explicitly cleared. Which is exactly the lifetime a session should have —
 * the account belongs to this device and this person, and nothing short of removing the app
 * is a reason to forget that.
 *
 * Async, which supabase-js supports natively (`SupportedStorage` allows promises) — every
 * internal read already goes through `getItemAsync`.
 *
 * **The read falls back to `localStorage` once, and that fallback is a migration, not a
 * convenience.** Everyone already signed in on a build before this one has their session in
 * the old place; without this they would all be signed out by the update that was supposed
 * to stop signing them out. Once copied across, the legacy copy is dropped so there is only
 * ever one source of truth. */
const nativeStorage = {
    getItem: async (key) => {
        const { value } = await Preferences.get({ key })
        if (value !== null && value !== undefined) return value

        const legacy = local.get(key)
        if (legacy === null) return null

        await Preferences.set({ key, value: legacy })
        local.remove(key)
        return legacy
    },
    setItem: async (key, value) => {
        await Preferences.set({ key, value })
    },
    removeItem: async (key) => {
        await Preferences.remove({ key })
        /* Sign-out has to clear both, or the migration above resurrects the session. */
        local.remove(key)
    },
}

export const supabase = () => {
    if (client) return client

    if (!URL || !ANON_KEY) {
        throw new Error(
            "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart the dev server.",
        )
    }

    client = createClient(URL, ANON_KEY, {
        auth: {
            /* Session in client-side storage, refreshed client-side. No cookie, no
             * middleware. On native that storage is `UserDefaults`/`SharedPreferences`
             * rather than the WebView's localStorage — see `nativeStorage` above. */
            persistSession: true,
            autoRefreshToken: true,
            storageKey: STORAGE_KEY,
            storage: isNative() ? nativeStorage : undefined,

            /* Parse a session out of the URL fragment on load — this is what makes the
             * magic *link* in the sign-in email work when it is opened in a browser.
             *
             * Off on native, and it has to be: the boot guard in `app/layout.jsx` rewrites
             * any non-root URL to "/" before hydration, so a callback URL is gone before
             * this could read it. The native app signs in with the emailed code instead,
             * which needs no redirect, no custom URL scheme, and no Capacitor Browser/App
             * plugin round trip. */
            detectSessionInUrl: !isNative(),

            /* Implicit, not PKCE — and this is load-bearing rather than a leftover default.
             *
             * Supabase's `/auth/v1/verify` answers a magic link by redirecting to
             * `<site>#access_token=…&refresh_token=…`: the tokens arrive in the URL
             * *fragment*. A PKCE client ignores that entirely — it looks for `?code=` in the
             * query and exchanges it against a verifier it stored when it started the flow.
             * So with `flowType: "pkce"` the browser lands on a URL full of valid tokens and
             * does nothing with them, which looks exactly like a broken login.
             *
             * PKCE also cannot work for the two cases that matter here: a link generated by
             * the Admin API (`npm run dev:login`) never had a challenge, and a link opened on
             * a different device from the one that requested it has no verifier to exchange
             * against. There is no server in this app to do the exchange either.
             *
             * The trade is tokens in a URL fragment. Acceptable for an SPA — the fragment is
             * never sent to a server, and supabase-js strips it from the address bar once it
             * has read it. */
            flowType: "implicit",
        },
    })

    return client
}

/* ------------------------------------------------------------------------- */
/* The token                                                                 */
/* ------------------------------------------------------------------------- */

/* The current access token — and, when there isn't one, *why*.
 *
 * `getSession()` reads from storage and transparently refreshes a token inside its expiry
 * margin, so this is safe to call before every request, which is exactly what `lib/api.js`
 * does. Do not cache the result: a cached token outlives its refresh and starts 401ing
 * mid-session.
 *
 * **`stale` is the whole point of this returning an object.** It used to return the token
 * or null, and null collapsed two states that could not be more different:
 *
 *   - *no session* — signed out. An anonymous request is correct; the 401 is correct.
 *   - *a session that could not be refreshed right now* — the phone is on a train, or
 *     Supabase is having a minute. The refresh token on disk is fine and will work in
 *     thirty seconds.
 *
 * Sending the second one out anonymously earns a 401, and a 401 makes `api.js` sign the
 * viewer out — so a tunnel destroyed a perfectly good session and put a login screen in
 * front of someone who had done nothing but ride a train. That is the single worst failure
 * this app can have, and it was one `?.` away. supabase-js distinguishes the two for us: a genuine absence answers
 * `{ session: null, error: null }`, while a refresh that could not complete answers
 * `{ session: null, error }` and leaves the refresh token in storage. */
export const sessionToken = async () => {
    const { data, error } = await supabase().auth.getSession()
    const token = data?.session?.access_token ?? null
    if (token) return { token, stale: false }
    return { token: null, stale: Boolean(error) }
}

/* Force a refresh, ignoring the expiry margin. Returns the new token, or null if the
 * refresh could not be completed *or* the session is genuinely dead — the caller
 * distinguishes those by asking `sessionToken()` again.
 *
 * The one caller is the 401 retry in `lib/api.js`. Nothing else should reach for this:
 * `sessionToken()` already refreshes on its own schedule, and an extra forced refresh
 * rotates the refresh token for no reason. */
export const refreshSession = async () => {
    try {
        const { data, error } = await supabase().auth.refreshSession()
        if (error) return null
        return data?.session?.access_token ?? null
    } catch {
        return null
    }
}

/* ------------------------------------------------------------------------- */
/* Foreground / background                                                   */
/* ------------------------------------------------------------------------- */

/* Auto-refresh, under manual control — used only on native, and only from the auth store's
 * `resume`/`suspend`.
 *
 * supabase-js keeps a token alive with a 30-second `setInterval` plus a `visibilitychange`
 * listener. Neither survives a suspended app: the OS freezes the WebView's timers, so a
 * phone in a pocket for two hours wakes with an access token that expired ninety minutes
 * ago and a ticker that has not run since. The `visibilitychange` event is supposed to
 * cover that and does, on iOS — Android WebViews fire it inconsistently enough that it
 * cannot be the only thing standing between a reader and the login screen.
 *
 * So on native the app drives it from Capacitor's `appStateChange`, which is the platform's
 * own answer to "are we in the foreground", and is not guesswork. Note that
 * `startAutoRefresh()` deliberately *removes* supabase-js's managed visibility callback —
 * calling it is taking ownership, not adding a belt to the braces. Which is why the web
 * never calls it: there the built-in listener works, and replacing it would be a downgrade. */
export const startAutoRefresh = () => {
    try {
        supabase().auth.startAutoRefresh().catch(() => {})
    } catch {
        /* Unconfigured — `supabase()` throws on first use. The login screen already says so;
         * a wake-up is not the place to raise it again. */
    }
}

/* Stopped while backgrounded so a refresh cannot be *in flight* as the OS suspends the app.
 * That is its own way to lose a session: Supabase rotates the refresh token when it answers,
 * the app is frozen before it can write the new one down, and the next launch presents a
 * token the server has already retired — which past the reuse-detection window is a hard
 * sign-out. Not refreshing at all while suspended is strictly safer than refreshing into a
 * process that may not be alive to hear the answer. */
export const stopAutoRefresh = () => {
    try {
        supabase().auth.stopAutoRefresh().catch(() => {})
    } catch {
        /* See startAutoRefresh. */
    }
}
