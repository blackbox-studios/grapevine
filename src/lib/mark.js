/**
 * The Grapevine mark: its outline, its lighting geometry, and its palettes.
 *
 * This is data, not rendering. It lives apart from `<GlossyMark/>` because two very
 * different renderers consume it and they must not drift:
 *
 *   - `src/components/GlossyMark.jsx` paints it to a `<canvas>` per frame, because the
 *     colour wipe is animated.
 *   - `scripts/generate-icons.mjs` paints it to SVG and rasterizes it with sharp, because
 *     an app icon is a static file baked at build time and Node has no canvas.
 *
 * The two techniques differ by necessity; the geometry and the colour must not. Anything
 * either renderer would otherwise hardcode belongs here.
 *
 * Kept in step with `assets/svg/logo.svg` by hand — SVGR hands back a React component, not
 * path data, so the outline cannot be imported from the asset. If the logo changes, both
 * change.
 */

export const MARK_SIZE = { width: 139, height: 100 }

export const MARK_PATHS = [
    "M139 63.5921V32.2924C139 14.4765 124.734 0.0722022 106.969 0H74.9558V32.0758C74.9558 32.0758 74.9558 32.2202 74.9558 32.2924C74.9558 49.8195 89.2219 64.1516 106.752 64.1516H128.161C128.107 77.9061 116.852 89.1155 103.109 89.1155V100C122.984 100 139 83.9169 139 64.0613C139 63.8988 139 63.7545 139 63.5921Z",
    "M64.0082 63.5921V32.2924C64.0082 14.4765 49.7962 0.0722022 32.0131 0H0V32.0758H0.0180356C0.0180356 32.0758 0 32.2202 0 32.2924C0 49.8195 14.2842 64.1516 31.8147 64.1516H53.2049C53.0967 77.9061 41.9327 89.1155 28.1715 89.1155V100C48.0106 100 64.0082 83.9635 64.0082 64.1079C64.0082 63.9454 64.0082 63.7545 64.0082 63.5921Z",
]

/* The mark reads as two rounded counters side by side, each with a tail dropping from its
 * lower right. Each counter is lit like a sphere, which is what gives the shape its
 * blown-glass volume. Values are fractions of the mark's width/height — and because the
 * two counters sit side by side rather than on a diagonal, both lobes share a `y`. */
export const MARK_LOBES = [
    { x: 0.23, y: 0.32, r: 0.23 },
    { x: 0.77, y: 0.32, r: 0.23 },
]

/* `body` runs along the light axis (top-left → bottom-right) beneath the white specular
 * bloom, so each ramp spans a wide luminance range: the pale lit side reads against a dark
 * background, the dark base reads against a light one. `accent` is a mid tone from the
 * same family that clears the pill's contrast on either background and reads with white
 * button text — validated, not eyeballed (see the note on `jungle`).
 *
 * Order matters. `paletteFor` falls back to the first entry and `useMarkCycle` starts
 * there, so index 0 is the app's default — the brand green since the Grapevine rebrand. */
export const MARK_PALETTES = [
    {
        key: "jungle",
        /* Ramped through the brand jungle green (#2BBB9C, the light-mode `--brand` in
         * globals.css), which sits at the 0.72 stop where the body is most saturated. */
        body: [
            [0, "#c4f5e8"],
            [0.4, "#6bdcc2"],
            [0.72, "#2BBB9C"],
            [1, "#0d6b58"],
        ],
        rim: "#8aeed6",
        glint: "#ffffff",
        bloom: { alpha: 0.86, scale: 1 },
        /* Not the brand green itself: #2BBB9C carries only 2.4:1 against white button
         * text. This is the darkest tone of the same hue that still clears 4.5:1 with
         * white while staying above 3:1 on both app backgrounds (4.85 / 4.52 / 3.95). */
        accent: "#16806B",
    },
    {
        key: "steel",
        body: [
            [0, "#dbe0e8"],
            [0.42, "#9aa3b2"],
            [0.74, "#69717f"],
            [1, "#3a414c"],
        ],
        rim: "#c2c9d4",
        glint: "#ffffff",
        bloom: { alpha: 0.82, scale: 1 },
        accent: "#5f6a79",
    },
    {
        key: "graphite",
        body: [
            [0, "#aeb4be"],
            [0.42, "#6f7681"],
            [0.74, "#454b54"],
            [1, "#232830"],
        ],
        rim: "#8b929d",
        glint: "#ffffff",
        /* Reads as dark chrome: a tighter, harder specular than the others. */
        bloom: { alpha: 0.92, scale: 0.72 },
        accent: "#5a616c",
    },
    {
        key: "iris",
        body: [
            [0, "#e2e4ff"],
            [0.4, "#b3a8f6"],
            [0.72, "#8b76ec"],
            [1, "#4c3bc0"],
        ],
        rim: "#cdc0ff",
        glint: "#ffffff",
        bloom: { alpha: 0.88, scale: 1.05 },
        accent: "#6d5be6",
    },
    {
        key: "jade",
        body: [
            [0, "#a7f0c6"],
            [0.4, "#37c47e"],
            [0.72, "#12a45c"],
            [1, "#067a42"],
        ],
        rim: "#6fe3a8",
        glint: "#ffffff",
        bloom: { alpha: 0.85, scale: 1 },
        accent: "#0f9f57",
    },
]

export const paletteFor = (key) =>
    MARK_PALETTES.find(p => p.key === key) ?? MARK_PALETTES[0]
