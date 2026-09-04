/* Build a signed Android App Bundle and push it to a Play track.
 *
 *   npm run release:android -- --dry            # build and sign, upload nothing
 *   npm run release:android                     # ...and publish to the internal track
 *   npm run release:android -- --track alpha
 *   npm run release:android -- --draft --notes "Fixes the comment ordering"
 *   npm run release:android -- --no-bump        # release the version already in package.json
 *
 * The version lives in package.json, and android/app/build.gradle derives versionName and
 * versionCode by *reading* that file — so this script passes Gradle no version properties, and
 * the only thing it writes is the bump itself, through `npm version patch`. Play refuses a
 * versionCode it has seen before, and that code is a pure function of the version, so bumping is
 * part of releasing rather than something to remember beforehand.
 *
 * ── Why this talks to Google directly ───────────────────────────────────────
 *
 * The Play Developer API is four HTTP calls around an upload, and the access token in front of
 * them is a service-account JWT exchanged at Google's token endpoint — the same handful of
 * lines `src/lib/server/push.js` already runs against FCM, with `androidpublisher` in place of
 * `firebase.messaging`. `fastlane supply` does this well, but it does it in Ruby, and a
 * Gemfile is a large thing to introduce to a repo that has no Ruby in it for a flow this
 * shallow.
 *
 * ── The edit is a transaction ───────────────────────────────────────────────
 *
 * Play models a release as an "edit": insert one, mutate it, commit it. Nothing is visible
 * until the commit, and an abandoned edit expires on its own but clutters the console until it
 * does — so every failure below deletes the edit on the way out.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import dotenv from "dotenv"
import { importPKCS8, SignJWT } from "jose"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/* Next's own precedence for `next build`, reproduced here because the API URL has to be
 * checked *before* the build rather than discovered inside it. First file to define a key
 * wins, which is why .env.production sits above .env. */
dotenv.config({
    path: [".env.production.local", ".env.local", ".env.production", ".env"].map((f) => join(ROOT, f)),
    quiet: true,
})

const { requireShippableApiTarget, describeApiTarget, probeApiTarget } = await import(
    "./release-target.mjs"
)

/* ---------------------------------------------------------------------------
 * Arguments
 * ------------------------------------------------------------------------- */

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const option = (name, fallback) => {
    const i = argv.indexOf(`--${name}`)
    return i === -1 ? fallback : argv[i + 1]
}

const DRY = flag("dry")
const SKIP_BUILD = flag("skip-build")
const SKIP_PROBE = flag("skip-probe")
const NO_BUMP = flag("no-bump")
const TRACK = option("track", "internal")
const NOTES = option("notes", null)
/* A completed release goes live on the track; a draft waits in the console. Internal testing
 * is the only track where going straight to completed is uncontroversial, which is why that
 * is the default and --draft is the escape rather than the reverse. */
const STATUS = flag("draft") ? "draft" : "completed"

const PACKAGE_NAME = "com.throughgrapevine.app"

const die = (message) => {
    console.error(`\n✗ ${message}\n`)
    process.exit(1)
}

const run = (command, args, cwd = ROOT) =>
    execFileSync(command, args, { cwd, stdio: "inherit", env: process.env })

/* ---------------------------------------------------------------------------
 * Preflight — everything that can fail must fail before the three-minute build
 * ------------------------------------------------------------------------- */

/* Play rejects a versionCode it has already seen, and `versionCode` here is a pure function of
 * the version in package.json — so an upload without a bump is refused by the store rather than
 * by anything local, after the build has already run. Bumping first turns that into a
 * non-event.
 *
 * **`--dry` bumps too**, because a dry run still produces a real, signed, uploadable bundle, and
 * the console upload is exactly where a repeated code is rejected. Skipping the bump there would
 * leave the manual path — which is the whole first-release workflow — hitting the error this
 * exists to prevent.
 *
 * `npm version` writes package.json, commits, and tags. It refuses on a dirty tree, which is a
 * feature: a release should name a commit that exists. `--no-bump` is for re-uploading a version
 * deliberately, and it is implied by `--skip-build`, where the bundle on disk was built from
 * whatever the version was *then* and moving it now would only make the two disagree. */
if (!NO_BUMP && !SKIP_BUILD) {
    console.log("  → bumping the patch version")
    try {
        run("npm", ["version", "patch"])
    } catch {
        die(
            "`npm version patch` failed. It refuses to run with uncommitted changes —\n" +
                "  commit them, or pass --no-bump to release the version already in package.json.",
        )
    }
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
const versionName = pkg.version
const [major, minor, patch] = versionName.replace(/[-+].*$/, "").split(".").map(Number)
const versionCode = major * 10000 + minor * 100 + patch

requireShippableApiTarget(`Android ${versionName}`)

/* The same four values android/app/build.gradle looks for, checked here so an unsigned bundle
 * is refused up front rather than at the upload, which is the expensive place to find out. */
const keystoreFile = join(ROOT, "android", "keystore.properties")
const keystore = existsSync(keystoreFile) ? dotenv.parse(readFileSync(keystoreFile)) : {}
const signingReady = [
    ["storeFile", "GRAPEVINE_STORE_FILE"],
    ["storePassword", "GRAPEVINE_STORE_PASSWORD"],
    ["keyAlias", "GRAPEVINE_KEY_ALIAS"],
    ["keyPassword", "GRAPEVINE_KEY_PASSWORD"],
].every(([key, env]) => keystore[key] || process.env[env])

if (!signingReady) {
    die(
        "No release signing config. Play rejects an unsigned bundle.\n\n" +
            "  Generate an upload keystore once, and keep it somewhere durable and backed up —\n" +
            "  losing it means losing the ability to update the listing:\n\n" +
            "      keytool -genkeypair -v -keystore ~/keys/grapevine-upload.jks \\\n" +
            "          -alias grapevine -keyalg RSA -keysize 2048 -validity 10000\n\n" +
            "  Then write android/keystore.properties (untracked):\n\n" +
            "      storeFile=/Users/you/keys/grapevine-upload.jks\n" +
            "      storePassword=...\n" +
            "      keyAlias=grapevine\n" +
            "      keyPassword=...",
    )
}

const credentials = playCredentials()

function playCredentials() {
    if (DRY) return null

    const keyPath = process.env.PLAY_SERVICE_ACCOUNT_KEY
    if (keyPath) {
        const resolved = resolve(ROOT, keyPath)
        if (!existsSync(resolved)) die(`PLAY_SERVICE_ACCOUNT_KEY points at a file that is not there: ${resolved}`)
        const json = JSON.parse(readFileSync(resolved, "utf8"))
        return { clientEmail: json.client_email, privateKey: json.private_key }
    }

    const clientEmail = process.env.PLAY_CLIENT_EMAIL
    /* Escaped when the key travels through an environment variable, and importPKCS8 rejects it
     * outright in that form — the same unescaping src/lib/server/push.js does. */
    const privateKey = process.env.PLAY_PRIVATE_KEY?.replace(/\\n/g, "\n")

    if (!clientEmail || !privateKey) {
        die(
            "No Play credentials. Create a service account under Play Console →\n" +
                "  Users and permissions, grant it release access, download its JSON key, then set\n" +
                "  PLAY_SERVICE_ACCOUNT_KEY to the path. See .env.example.\n\n" +
                "  Or pass --dry to build and sign without uploading.",
        )
    }
    return { clientEmail, privateKey }
}

console.log(`\n  Grapevine ${versionName}  (versionCode ${versionCode})`)
console.log(`  API:    ${describeApiTarget()}`)
console.log(`  Target: ${DRY ? "build only, no upload" : `${TRACK} track, ${STATUS}`}\n`)

/* Asks the deployed API the question the app's first request will ask, before spending three
 * minutes building a bundle that could not talk to it. */
if (!SKIP_PROBE) {
    process.stdout.write("  → checking the API answers the native app... ")
    const problems = await probeApiTarget()
    if (problems.length) {
        console.log("no\n")
        die(
            `${problems.join("\n  ")}\n\n` +
                "  Fix the deployment or NEXT_PUBLIC_API_BASE_URL, or pass --skip-probe to\n" +
                "  build anyway (the URL is inlined, so a wrong one cannot be corrected later).",
        )
    }
    console.log("yes")
}

/* ---------------------------------------------------------------------------
 * Build
 * ------------------------------------------------------------------------- */

const bundlePath = join(ROOT, "android/app/build/outputs/bundle/release/app-release.aab")

if (SKIP_BUILD) {
    if (!existsSync(bundlePath)) die(`--skip-build, but there is no bundle at ${bundlePath}`)
    console.log("  → reusing the existing bundle (--skip-build)\n")
} else {
    console.log("  → building the static export\n")
    run("npm", ["run", "build:native"])

    console.log("\n  → syncing into android/\n")
    run("npx", ["cap", "sync", "android"])

    console.log("\n  → assembling the signed bundle\n")
    run("./gradlew", ["bundleRelease"], join(ROOT, "android"))
}

if (!existsSync(bundlePath)) die(`Gradle reported success but there is no bundle at ${bundlePath}`)

const bundle = readFileSync(bundlePath)
const sizeMb = (statSync(bundlePath).size / 1024 / 1024).toFixed(1)
console.log(`\n  ✓ ${bundlePath}  (${sizeMb} MB)`)

if (DRY) {
    console.log(
        "\n  Nothing uploaded (--dry). Drop that file into the Play Console, or drop --dry.\n" +
            "\n  Note: build:native overwrites .next with the static export, so run\n" +
            "  `npm run build` again before `npm run start`.\n",
    )
    process.exit(0)
}

/* ---------------------------------------------------------------------------
 * Play Developer API
 * ------------------------------------------------------------------------- */

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const SCOPE = "https://www.googleapis.com/auth/androidpublisher"
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}`
const UPLOAD_API = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE_NAME}`

const accessToken = async () => {
    const key = await importPKCS8(credentials.privateKey, "RS256")

    const assertion = await new SignJWT({ scope: SCOPE })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(credentials.clientEmail)
        .setSubject(credentials.clientEmail)
        .setAudience(TOKEN_URL)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(key)

    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
        }),
    })

    if (!res.ok) die(`Play auth failed (${res.status}): ${await res.text()}`)
    return (await res.json()).access_token
}

const token = await accessToken()

const call = async (url, { method = "GET", body, contentType = "application/json" } = {}) => {
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { "Content-Type": contentType }),
        },
        body: body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : body,
    })

    if (!res.ok) throw new Error(`${method} ${url.replace(API, "")} → ${res.status}: ${await res.text()}`)
    return res.status === 204 ? null : res.json()
}

console.log("\n  → opening an edit")
const edit = await call(`${API}/edits`, { method: "POST", body: {} })

try {
    console.log("  → uploading the bundle")
    const uploaded = await call(`${UPLOAD_API}/edits/${edit.id}/bundles?uploadType=media`, {
        method: "POST",
        body: bundle,
        contentType: "application/octet-stream",
    })

    if (uploaded.versionCode !== versionCode) {
        throw new Error(
            `Play read versionCode ${uploaded.versionCode} from the bundle, but package.json says ${versionCode}. ` +
                "The bundle is stale — rebuild without --skip-build.",
        )
    }

    console.log(`  → assigning ${uploaded.versionCode} to the ${TRACK} track`)
    await call(`${API}/edits/${edit.id}/tracks/${TRACK}`, {
        method: "PUT",
        body: {
            track: TRACK,
            releases: [
                {
                    /* Play wants these as strings even though they are integers everywhere else. */
                    versionCodes: [String(uploaded.versionCode)],
                    status: STATUS,
                    name: `${versionName} (${uploaded.versionCode})`,
                    ...(NOTES ? { releaseNotes: [{ language: "en-US", text: NOTES }] } : {}),
                },
            ],
        },
    })

    console.log("  → committing")
    await call(`${API}/edits/${edit.id}:commit`, { method: "POST", body: {} })

    console.log(
        `\n  ✓ Grapevine ${versionName} (${uploaded.versionCode}) is on the ${TRACK} track as ${STATUS}.\n` +
            "\n  Note: build:native overwrote .next with the static export, so run\n" +
            "  `npm run build` again before `npm run start`.\n",
    )
} catch (error) {
    await call(`${API}/edits/${edit.id}`, { method: "DELETE" }).catch(() => {})
    die(`${error.message}\n\n  The edit was discarded; nothing was published.`)
}
