/** @type {import('next').NextConfig} */

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

    ...(native
        ? {
              output: "export",
              /* Capacitor serves the bundle off a local file handler, so there is no
               * image optimizer (or any other server route) to hit. */
              images: { unoptimized: true },
              /* Do NOT add `distDir` here to keep this build away from `next dev`'s
               * .next — with `output: "export"` Next writes the exported site *into*
               * distDir, so it silently relocates out/ and cap sync then fails with
               * "Could not find the web assets directory: ./out". Stop the dev server
               * before a native build instead; see native-architecture.md. */
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

export default nextConfig
