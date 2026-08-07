/** @type {import('next').NextConfig} */

/* Subpath the app is served under. Empty for local dev; the combined image can set
 * NEXT_PUBLIC_BASE_PATH=/<slug> to match the backend mount. Kept in sync with
 * appPath()/basePath() in src/lib/utils.js. */
const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "")

const nextConfig = {
    ...(rawBasePath ? { basePath: rawBasePath } : {}),

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
