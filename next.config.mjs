/** @type {import('next').NextConfig} */
import { createRequire } from "node:module"

import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js"

const { version } = createRequire(import.meta.url)("./package.json")

/* What `/settings/about` prints, inlined here because neither value can be read at runtime:
 * the native target is a static export inside a WebView with no process to ask, and the
 * version lives in package.json, which the client bundle must not import.
 *
 * The build stamp is the one that earns its place. `npm run sync` copies `out/` into the
 * native projects, so a device can be running a bundle several syncs older than the version
 * it names; the timestamp is the only thing that separates them. */
const builtAt = new Date().toISOString()

/* Subpath the app is served under. Empty for local dev; the combined image can set
 * NEXT_PUBLIC_BASE_PATH=/<slug> to match the backend mount. Kept in sync with
 * appPath()/basePath() in src/lib/utils.js. */
const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "")

/* Two build targets from one codebase (see .claude/skills/develop/native-architecture.md):
 *
 *   npm run build         → the Node server build. Retains route handlers and every
 *                           other server feature, so this is the target for a real /api.
 *   npm run build:native  → NEXT_PUBLIC_NATIVE=1, a fully static export into out/, which
 *                           is what Capacitor copies into the iOS/Android app.
 *
 * The export is not a lesser build, it is a different deployment: a Capacitor WebView has
 * no Node process to talk to, so anything server-rendered has to be gone. Next drops
 * middleware silently under `output: "export"` rather than failing the build, which is why
 * the auth gate lives in <AuthGate/> on the client — that gate is the only one the native
 * app gets. The flag is NEXT_PUBLIC_ so client code can branch on it too (see isNative()). */
const native = process.env.NEXT_PUBLIC_NATIVE === "1"

const nextConfig = {
    ...(rawBasePath ? { basePath: rawBasePath } : {}),

    env: {
        NEXT_PUBLIC_APP_VERSION: version,
        NEXT_PUBLIC_BUILT_AT: builtAt,
    },

    /* Which filenames Next treats as routes — and the seam that keeps the API out of the
     * native bundle. Route handlers live in `route.api.js` files, so they are only routes
     * when `api.js` is a recognized page extension, which is the Node build only.
     *
     * This is load-bearing, not stylistic. `output: "export"` cannot host route handlers:
     * it fails the build with `export const dynamic = "force-static"/export const
     * revalidate not configured on route "/api/..."`, and force-static is incompatible with
     * reading query params or serving POST — i.e. with the API actually working. Dropping
     * the extension makes the whole `src/app/api/**` tree invisible to that build instead,
     * so the export stays clean and the native app talks to a deployed API by absolute URL
     * (NEXT_PUBLIC_API_BASE_URL). See .claude/skills/develop/backend-architecture.md. */
    pageExtensions: native ? ["jsx", "js"] : ["api.js", "jsx", "js"],

    ...(native
        ? {
              output: "export",
              /* Capacitor serves the bundle off a local file handler, so there is no
               * image optimizer (or any other server route) to hit. */
              images: { unoptimized: true },
          }
        : {}),

    /* Import .svg files as React components (default export), matching the old
     * vite-plugin-svgr behaviour so `import Icon from "@/assets/svg/x.svg"` works.
     * No `issuer` filter: every .svg in this app is used as a component (never as a
     * URL), and an issuer filter fails to match across Next's server-component layer. */
    webpack(config) {
        config.module.rules.push({
            test: /\.svg$/i,
            use: ["@svgr/webpack"],
        })
        return config
    },

    /* Turbopack equivalent of the SVGR rule (used when running with --turbopack). */
    turbopack: {
        rules: {
            "*.svg": {
                loaders: ["@svgr/webpack"],
                as: "*.js",
            },
        },
    },
}

/* The dev server builds into its own directory, which is what lets `npm run build`
 * and `npm run build:native` run while `next dev` is up without corrupting it.
 *
 * The move has to be on this side. Under `output: "export"` Next reads `distDir` as
 * where the *exported site* goes and forces the build directory back to `.next`
 * (hasCustomExportOutput, in next/dist/build), so pointing the native build somewhere
 * else silently relocates out/ and `cap sync` then fails with "Could not find the web
 * assets directory: ./out". Moving the dev server costs nothing by comparison: a
 * production build overwriting .next is then writing a directory nothing is reading. */
export default (phase) =>
    phase === PHASE_DEVELOPMENT_SERVER ? { ...nextConfig, distDir: ".next-dev" } : nextConfig
