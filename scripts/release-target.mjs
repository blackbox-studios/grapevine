/* Which API a store build is about to be pointed at, and whether that is allowed.
 *
 * Imported by the release scripts. It is the same guard rail as `db-target.mjs`, one layer
 * out: that one stops a destructive command reaching the parish's database, this one stops a
 * shippable artifact being built against an address only your laptop can resolve.
 *
 * ── The failure this prevents ────────────────────────────────────────────────
 *
 * `NEXT_PUBLIC_API_BASE_URL` is inlined at build time, so whatever it says when
 * `build:native` runs is compiled into the bundle Capacitor ships — there is no runtime
 * override and no way to correct it short of a new upload. The value that is *useful* during
 * development is a LAN address over plain HTTP, because that is how a phone on the same wifi
 * reaches `next dev`. Ship that and every install talks to a machine that is not there.
 *
 * The cleartext half fails more quietly than it should. `android/app/src/debug/` carries a
 * network security config permitting HTTP, which is exactly why device testing works; release
 * builds get the platform default, which forbids it. So an http:// bundle installs, launches,
 * and fails every request with a message about the network rather than about the URL.
 *
 * This is a guard rail, not a security boundary — anyone who can set the variable can set
 * ALLOW_INSECURE_API. It is here to stop the accident, which is the thing that happens.
 */

/* Hosts that cannot be reachable from a stranger's phone. `.local` is mDNS, which resolves
 * on your wifi and nowhere else. */
const PRIVATE_HOSTNAME = /^(localhost|.*\.local)$/
const PRIVATE_IPV4 = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/

const isPrivateHost = (hostname) =>
    PRIVATE_HOSTNAME.test(hostname) ||
    PRIVATE_IPV4.test(hostname) ||
    hostname === "::1" ||
    hostname === "[::1]"

/**
 * Everything wrong with a candidate API base URL, as sentences. Empty means it is shippable.
 */
export const apiTargetProblems = (url = process.env.NEXT_PUBLIC_API_BASE_URL) => {
    if (!url) return ["NEXT_PUBLIC_API_BASE_URL is unset — the app would have no API to call."]

    let parsed
    try {
        parsed = new URL(url)
    } catch {
        return [`NEXT_PUBLIC_API_BASE_URL is not a URL: ${url}`]
    }

    const problems = []

    if (parsed.protocol !== "https:") {
        problems.push(
            `${url} is not HTTPS. Release builds get the platform's default network policy,` +
                " which blocks cleartext — every request fails at the transport.",
        )
    }
    if (isPrivateHost(parsed.hostname)) {
        problems.push(`${parsed.hostname} is a private address, reachable only on your network.`)
    }

    return problems
}

export const describeApiTarget = (url = process.env.NEXT_PUBLIC_API_BASE_URL) =>
    url ? `${url}${apiTargetProblems(url).length ? " (NOT SHIPPABLE)" : ""}` : "unset"

/* The origin a Capacitor WebView calls from on iOS. Any allowed origin proves the check;
 * this is the one `handler.js` lists first. */
const NATIVE_ORIGIN = "capacitor://localhost"

/**
 * Asks the deployed API whether it will actually answer the native app, by sending the
 * CORS preflight the app's first authenticated request will send.
 *
 * Static inspection of the URL cannot catch what this catches. **A preflight that receives a
 * redirect is a network error** — per the Fetch spec preflights do not follow them — and every
 * request this app makes carries an `Authorization` header, which is what forces a preflight in
 * the first place. So an apex host that 308s to `www` produces a bundle where *every* API call
 * fails, while the same URL opened in a browser looks perfectly healthy: the web app is
 * same-origin and never preflights at all.
 *
 * That failure is unrecoverable once shipped, because the URL is inlined at build time. One
 * round trip before a release is a cheap way to never find out from a one-star review.
 *
 * Returns a list of sentences, empty if the API answered correctly.
 */
export const probeApiTarget = async (url = process.env.NEXT_PUBLIC_API_BASE_URL) => {
    const probe = new URL("me", url.endsWith("/") ? url : `${url}/`)

    let response
    try {
        response = await fetch(probe, {
            method: "OPTIONS",
            redirect: "manual",
            headers: {
                Origin: NATIVE_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
            signal: AbortSignal.timeout(15_000),
        })
    } catch (error) {
        return [`${probe} could not be reached: ${error.message}`]
    }

    if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        return [
            `${probe} answered ${response.status} (redirect${location ? ` to ${location}` : ""}).`,
            "A CORS preflight is never redirected — it fails as a network error — so every" +
                " authenticated request from the app would fail." +
                (location ? ` Point NEXT_PUBLIC_API_BASE_URL at the redirect target instead.` : ""),
        ]
    }

    const allowed = response.headers.get("access-control-allow-origin")
    if (allowed !== NATIVE_ORIGIN) {
        return [
            `${probe} did not allow ${NATIVE_ORIGIN} (got ${allowed ?? "no allow-origin header"}).`,
            "Add it to CORS_ALLOWED_ORIGINS on the deployed API — see ALLOWED_ORIGINS in" +
                " src/lib/server/handler.js.",
        ]
    }

    return []
}

/**
 * Exits unless the configured API is one a real install could reach.
 *
 * `action` names what was about to be built, so the message is about the consequence — "this
 * bundle would ship pointing at your laptop" is what makes someone stop.
 */
export const requireShippableApiTarget = (action) => {
    const problems = apiTargetProblems()
    if (!problems.length) return

    if (process.env.ALLOW_INSECURE_API === "1") {
        console.warn(`! ALLOW_INSECURE_API=1 — building "${action}" against ${describeApiTarget()} anyway.\n`)
        return
    }

    console.error(
        `\n✗ Refusing to build "${action}" against ${describeApiTarget()}.\n\n` +
            problems.map((p) => `    • ${p}`).join("\n") +
            "\n\n  This value is inlined into the bundle at build time, so it cannot be\n" +
            "  corrected without another upload. Point NEXT_PUBLIC_API_BASE_URL in\n" +
            "  .env.production at the deployed API.\n\n" +
            "  To build one anyway — for a device test that never leaves your desk —\n" +
            "  re-run with ALLOW_INSECURE_API=1 prefixed.\n",
    )
    process.exit(1)
}
