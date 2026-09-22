import "server-only"

import {
    SCOPES,
    firebaseConfigured,
    firebaseProject,
    googleAccessToken,
} from "@/lib/server/google"

/* The app's feature flags, read from Firebase Remote Config.
 *
 * Two values today, and they are the same kind of thing: something an admin flips in a console
 * and every client obeys on its next boot, without a release. `messaging_enabled` takes direct
 * messages away; `minimum_version` is the floor below which a native build is told to update.
 *
 * ── Why the server reads them and not the client ────────────────────────────
 *
 * Reading Remote Config on the device means the Firebase client SDK — the native plugin on
 * iOS and Android, and a second, separately-configured web app for the browser. That is a
 * Capacitor plugin (a pod install and a native rebuild on both platforms) to deliver two
 * values, and it leaves the web build with no flags at all. Here it is one HTTP call from a
 * server that already holds the credential, and the answer is identical on every target.
 *
 * The cost is real and worth naming: **conditions do not apply.** Remote Config's targeting
 * (by app version, country, percentage rollout) is evaluated by the client SDK, so the REST
 * template this reads gives back each parameter's `defaultValue` and nothing else. Both flags
 * here are global, which is why that is affordable — a flag that needs to be true for half the
 * parishes is not a flag this module can serve.
 *
 * ── How long a flip takes to land ───────────────────────────────────────────
 *
 * `TTL_MS` below, plus however long until the reader's client next asks — a launch, a
 * foreground, or regaining a connection. So about a minute in the ordinary case.
 *
 * **The lease is per process, and that is not a development quirk.** A long-lived Node server
 * (`next dev`, `next start`) holds exactly one, which is why restarting it appears to make a
 * flag take effect instantly: the restart threw the lease away. On Vercel every warm function
 * instance holds its own, so during the window different requests can legitimately answer
 * differently, and a flag can appear to flip back and forth until the last instance's lease
 * expires. Nothing reconciles them and nothing should: the window is what `TTL_MS` bounds, and
 * it is set short for exactly this reason rather than for the cost of the reads.
 *
 * ── Every failure is an open door ───────────────────────────────────────────
 *
 * An unconfigured deploy, a revoked key, a Google outage, a parameter somebody typed wrong:
 * all of them resolve to the defaults below, which turn nothing off and lock nobody out. That
 * direction is the whole posture. A flag service that fails closed can take messaging away
 * from every parish at once, or wall every phone behind an update, and the people it happens
 * to have no way to undo it — where failing open means the worst outcome is a flag that did
 * not take effect until the next boot. */

/* What the app does when nothing says otherwise. `minimumVersion` is null rather than a
 * version, because "no floor" is the only safe thing to believe when the answer is unknown. */
const DEFAULTS = Object.freeze({
    messagingEnabled: true,
    minimumVersion: null,
})

const TEMPLATE_URL = () =>
    `https://firebaseremoteconfig.googleapis.com/v1/projects/${firebaseProject()}/remoteConfig`

/* The lease on an answer. Short, because this is a kill switch: somebody who switches messaging
 * off wants it off, and somebody who switches it back on should not have to wonder whether they
 * did it properly. A minute costs at most sixty template reads per hour per process, which is
 * nothing beside what it buys. */
const TTL_MS = 60_000

/* A failed read keeps the answer already in hand on a much shorter lease, so an outage retries
 * soon without every request in the meantime paying the timeout. */
const RETRY_MS = 30_000

const FETCH_TIMEOUT_MS = 4_000

const readBoolean = (raw, fallback) => {
    if (raw === "true") return true
    if (raw === "false") return false
    return fallback
}

/* A version floor, or null.
 *
 * **Anything unrecognised is null, deliberately.** This value is the one thing in the app that
 * can put a wall in front of every reader at once, and a typo in a console field must not be
 * able to raise it — an unparseable floor is treated as no floor rather than as a floor
 * nothing can satisfy. `compareVersions` in `lib/utils.js` reads the same three-number shape on
 * the client. */
const VERSION = /^\d+\.\d+\.\d+$/

const readVersion = (raw) => {
    const value = typeof raw === "string" ? raw.trim() : ""
    return VERSION.test(value) ? value : null
}

/* The REST template carries each parameter's `defaultValue` plus its `conditionalValues`, and
 * only the first of those can be resolved without a client — see the header. */
const parseTemplate = (template) => {
    const value = (name) => template?.parameters?.[name]?.defaultValue?.value

    return {
        messagingEnabled: readBoolean(value("messaging_enabled"), DEFAULTS.messagingEnabled),
        minimumVersion: readVersion(value("minimum_version")),
    }
}

let cached = { flags: DEFAULTS, until: 0 }
let inflight = null

const load = async () => {
    try {
        const auth = await googleAccessToken(SCOPES.REMOTE_CONFIG)

        const res = await fetch(TEMPLATE_URL(), {
            headers: { Authorization: `Bearer ${auth}`, Accept: "application/json" },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`)

        cached = { flags: parseTemplate(await res.json()), until: Date.now() + TTL_MS }
    } catch (error) {
        console.error("[config] could not read Remote Config", error)
        cached = { ...cached, until: Date.now() + RETRY_MS }
    }

    return cached.flags
}

/* The flags, cached. Never throws and never blocks longer than the timeout above. */
export const appConfig = async () => {
    if (!firebaseConfigured()) return DEFAULTS
    if (Date.now() < cached.until) return cached.flags

    inflight ??= load().finally(() => {
        inflight = null
    })

    return inflight
}

/* Whether direct messaging is switched on at all.
 *
 * Read by `messages.service.js` on every entry point, which is what makes the flag a control
 * rather than a way of hiding the chrome — the nav entry and the send icon come off the same
 * value, but a client that drew them anyway gets a 403. */
export const messagingEnabled = async () => (await appConfig()).messagingEnabled
