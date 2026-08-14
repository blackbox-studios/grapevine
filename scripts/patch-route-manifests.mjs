/* Workaround for https://github.com/vercel/next.js/issues/76955 (open).
 *
 * This app sets a custom `pageExtensions` (`api.js`) in next.config.mjs so that
 * route handlers live in `route.api.js` and stay invisible to the native static
 * export (see .claude/skills/develop/native-architecture.md — that seam is load-
 * bearing and must not be removed). But a custom `pageExtensions` makes Next's
 * output tracing expect a `route_client-reference-manifest.js` beside every App
 * Router route handler, which Next never actually emits for a pure route handler.
 *
 * Local `next build` survives it (the extension list still contains js/jsx, so
 * "Collecting page data" passes), but Vercel's builder lstat/copies that manifest
 * per API route and fails with:
 *   ENOENT ... .next/server/app/api/.../route_client-reference-manifest.js
 *
 * Fix: after `next build`, write a minimal, valid manifest next to any route.js
 * that is missing one. A route handler renders no client components, so the empty
 * mapping is correct — the file just needs to exist for the tracing/copy step.
 *
 * This runs from the web `build` script only (`next build && node <this>`). The
 * native build (`build:native`) drops `api.js` from pageExtensions, so it never
 * compiles src/app/api/**, no route.js is emitted, and this script is a no-op.
 */
import { readdir, stat, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, relative, sep } from "node:path"

const APP_DIR = join(process.cwd(), ".next", "server", "app")
const MANIFEST_SUFFIX = "_client-reference-manifest.js"

/* The RSC manifest key mirrors the app-paths-manifest key: the route's path under
 * .next/server/app, minus the .js extension, POSIX-separated, leading slash.
 * Route groups like (public) are part of the on-disk path and are kept verbatim. */
function manifestKey(routeFile) {
    const rel = relative(APP_DIR, routeFile).replace(/\.js$/, "")
    return "/" + rel.split(sep).join("/")
}

function emptyManifest(key) {
    const body = {
        moduleLoading: { prefix: "/_next/" },
        ssrModuleMapping: {},
        edgeSSRModuleMapping: {},
        clientModules: {},
        entryCSSFiles: {},
        rscModuleMapping: {},
        edgeRscModuleMapping: {},
    }
    return (
        "globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});" +
        `globalThis.__RSC_MANIFEST[${JSON.stringify(key)}]=${JSON.stringify(body)}`
    )
}

async function* walk(dir) {
    let entries
    try {
        entries = await readdir(dir, { withFileTypes: true })
    } catch {
        return
    }
    for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) yield* walk(full)
        else yield full
    }
}

async function main() {
    if (!existsSync(APP_DIR)) return // native export or no server build — nothing to do

    let patched = 0
    for await (const file of walk(APP_DIR)) {
        if (!file.endsWith(`${sep}route.js`) && file !== join(APP_DIR, "route.js"))
            continue

        const manifest = file.replace(/route\.js$/, `route${MANIFEST_SUFFIX}`)
        if (existsSync(manifest)) continue

        const key = manifestKey(file)
        await writeFile(manifest, emptyManifest(key), "utf8")
        patched++
        console.log(`  + ${relative(process.cwd(), manifest)}`)
    }

    if (patched > 0)
        console.log(`patch-route-manifests: wrote ${patched} missing route manifest(s)`)
}

main().catch((err) => {
    console.error("patch-route-manifests failed:", err)
    process.exit(1)
})
