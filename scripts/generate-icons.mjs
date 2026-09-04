/**
 * Generates every native app icon and splash screen from the shared mark definition.
 *
 * Run it after changing the logo, the palettes, or the brand colors:
 *
 *     npm run icons
 *
 * Then `npm run sync` to push the results into the native projects. The outputs are
 * checked in, so a machine without the toolchain can still build.
 *
 * TWO LOOKS, ONE OUTLINE
 *
 * The **icon** is the blown-glass mark on a black field — jungle, the same
 * lighting `<GlossyMark/>` opens on.
 * The **splash** is that mark on white by day and the app's near-black by night,
 * with the type logo centred on the foot of the canvas.
 *
 * Both take their outline from `src/lib/mark.js`, shared with `<GlossyMark/>` so the icon
 * and the on-screen mark cannot drift. The gloss *rendering* is necessarily a second
 * implementation: the component paints to a `<canvas>` per frame and Node has no canvas, so
 * `markSvg` rebuilds the same lighting model in SVG — a linear body ramp, a radial specular
 * bloom per lobe, a blurred rim light and counter-edge, and two hard glints — and lets sharp
 * rasterize it through librsvg. Vector in, so every size is resampled from the outline
 * rather than from a bitmap. If you change the look in one, change it in the other;
 * `lib/mark.js` is what keeps the inputs honest.
 *
 * THE PROPORTIONS
 *
 *   iOS 1024 / legacy launcher   mark 0.72 of canvas width, centered
 *   adaptive foreground          mark 0.48 of canvas width, centered
 *   splash                       mark 0.159 of min(canvas), center at y = 0.40
 *                                wordmark 0.13 of min(canvas) wide, inset 0.085 from the bottom
 *
 * The splash values were measured off the icons this replaced, offset included — the mark
 * sits above the optical centre so it reads correctly with the status bar. The wordmark is
 * the type logo, centred on the foot of the canvas, small enough that it reads as a caption
 * for the mark rather than as a second hero. The icon values are not: they were raised to
 * 0.72 to fill the field the way Messages and Spotify do.
 *
 * These are fractions of the *mark's bounding box*, which is why the gloss is drawn into a
 * padded viewBox and the padding is divided back out before compositing: the rim light and
 * glints bleed past the outline, and sizing to the padded bitmap would render the mark ~12%
 * small.
 *
 * WHY THE ADAPTIVE FOREGROUND IS SMALLER
 *
 * Android composites the foreground over the background and lets the launcher mask the
 * result to whatever shape the OEM picked. Only the central 72dp of the 108dp canvas
 * survives every mask; the outer 18dp is reserved for the parallax the launcher applies on
 * scroll. 0.48 is 0.72 x (72/108) — the same optical size as the others, expressed as a
 * fraction of a canvas that is 1.5x larger than what shows.
 */

import { Buffer } from "node:buffer"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

import { MARK_LOBES, MARK_PATHS, MARK_SIZE, bodyRampFor, paletteFor } from "../src/lib/mark.js"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { width: W, height: H } = MARK_SIZE

/* The launcher field is black — the tile the jungle mark sits on. A coloured
 * field, even a dark brand tint, reads as a second hue next to the glass. */
const ICON_FIELD = { top: "#000000", bottom: "#000000" }

/* The adaptive icon's colour-resource fallback. See buildAndroid. */
const ICON_BG = "#000000"

/* The splash follows the system appearance, exactly as the icons this replaced did: white
 * by day, the app's near-black by night. Collapsing the two to one colour is the bug that
 * produced a black daytime splash in front of a white app. Android picks these by the
 * `-night` resource qualifier and iOS by the `-dark` half of the imageset; both fall back
 * to the day file, so the day value is also the safe default. */
const SPLASH_BG = "#FFFFFF"
const SPLASH_DARK_BG = "#0A1014"

/* Fractions of canvas width taken up by the mark's bounding box.
 *
 * The icon values are set by eye against the Messages icon, whose bubble fills roughly 0.72
 * of its canvas — deliberately larger than the 0.60 measured off the icons this replaced,
 * which left the mark looking lost inside its field.
 *
 * `ADAPTIVE_SCALE` is not 0.72 because it is a fraction of a *different* canvas: only the
 * central 72dp of Android's 108dp adaptive square is guaranteed to survive an OEM mask, so
 * matching the others optically means 0.72 x (72/108) = 0.48 of the full square. The splash
 * keeps its measured value — it is a whole screen, not an icon. */
const IOS_SCALE = 0.72
const LEGACY_SCALE = 0.72
const ADAPTIVE_SCALE = 0.48
const SPLASH_SCALE = 0.159

/** Splash mark centre, as a fraction of canvas height. 0.40 = above centre. */
const SPLASH_CENTER_Y = 0.40

/* Wordmark on the splash: width as a fraction of the shorter canvas side, and how far
 * its bottom edge sits from the canvas foot. Sized off `min(w, h)` so it keeps one
 * physical size as the device rotates, the same rule as the mark. Fill is the jungle
 * 0.72 stop — the same green the glossy mark is ramped through — at half opacity, on
 * both appearances. */
const SPLASH_TYPE_SCALE = 0.13
const SPLASH_TYPE_BOTTOM = 0.085
const SPLASH_TYPE_FILL = "#2BBB9C"
const SPLASH_TYPE_OPACITY = 0.5

/* The gloss bleeds outside the outline (rim light, blurred counter-edge, glints), so the
 * SVG is drawn into a viewBox padded by this fraction of the mark's width on every side.
 * Compositing divides it back out — see `renderMark`. */
const BLEED = 0.06

const DENSITIES = [
    { name: "mdpi", legacy: 48, adaptive: 108 },
    { name: "hdpi", legacy: 72, adaptive: 162 },
    { name: "xhdpi", legacy: 96, adaptive: 216 },
    { name: "xxhdpi", legacy: 144, adaptive: 324 },
    { name: "xxxhdpi", legacy: 192, adaptive: 432 },
]

const SPLASH_DENSITIES = [
    { name: "mdpi", port: [320, 480], land: [480, 320] },
    { name: "hdpi", port: [480, 800], land: [800, 480] },
    { name: "xhdpi", port: [720, 1280], land: [1280, 720] },
    { name: "xxhdpi", port: [960, 1600], land: [1600, 960] },
    { name: "xxxhdpi", port: [1280, 1920], land: [1920, 1280] },
]

/** `#rrggbb` + alpha → an `rgba()` librsvg will accept. */
const withAlpha = (hex, alpha) => {
    const [r, g, b] = hex.replace("#", "").match(/../g).map(v => parseInt(v, 16))
    return `rgba(${r},${g},${b},${alpha})`
}

/* The wordmark is `src/assets/svg/type-logo.svg`, which fills with `currentColor` so the
 * gateway can theme it. A splash PNG has no currentColor, so the fill is substituted
 * here — the jungle green, on both the day splash and the night one. */
const TYPE_LOGO_PATH = path.join(ROOT, "src/assets/svg/type-logo.svg")
let typeLogo = null

async function loadTypeLogo() {
    const source = await readFile(TYPE_LOGO_PATH, "utf8")
    const match = source.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
    if (!match) throw new Error("type-logo.svg is missing a 0 0 viewBox")
    typeLogo = { source, width: Number(match[1]), height: Number(match[2]) }
}

async function renderTypeLogo(fill, width) {
    const height = Math.round(width * (typeLogo.height / typeLogo.width))
    const svg = typeLogo.source.replaceAll("currentColor", fill)
    const buffer = await sharp(Buffer.from(svg), { density: 512 })
        .resize({ width, height })
        .png()
        .toBuffer()
    return { buffer, width, height }
}

/**
 * Builds the glossy mark as a standalone SVG document.
 *
 * Mirrors `paintMark` in `<GlossyMark/>`: a body ramp per counter (the same lighting
 * on each g), a specular bloom over each lobe, a rim light offset up-left so its glow
 * lands bottom-right, a dark counter-edge offset the other way, and a hard glint on
 * each lobe.
 *
 * Containment is a `<clipPath>` here rather than the component's `source-atop`, because
 * SVG clipping antialiases — it is the canvas version that had to avoid `clip()`.
 *
 * `shadow` drops a soft cast under the outline, outside the clip — the mark sitting on
 * the field, which is how a volumetric glyph reads on a dark tile. Splash omits it:
 * there is no tile, and a shadow on white is a smudge.
 *
 * `x`/`y`/`width`/`height` nest this document inside another (the icon field) so the
 * gloss antialiases against the gradient in one rasterization rather than compositing
 * two bitmaps.
 */
function markSvg(palette, { shadow = false, x, y, width, height } = {}) {
    const pad = BLEED * W
    const vb = `${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`
    const d = MARK_PATHS.join(" ")
    const svgW = width ?? (W + pad * 2)
    const svgH = height ?? (H + pad * 2)
    const placed = x != null ? ` x="${x}" y="${y}"` : ""

    const bodyStops = palette.body
        .map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`)
        .join("")

    const bodyRamps = MARK_LOBES.map((lobe, i) => {
        const ramp = bodyRampFor(lobe)
        return `
    <linearGradient id="body${i}" gradientUnits="userSpaceOnUse"
                    x1="${ramp.x1}" y1="${ramp.y1}" x2="${ramp.x2}" y2="${ramp.y2}">
      ${bodyStops}
    </linearGradient>`
    }).join("")

    const bodyFills = MARK_PATHS
        .map((path, i) => `<path d="${path}" fill="url(#body${i})" fill-rule="evenodd"/>`)
        .join("")

    const { alpha, scale } = palette.bloom
    const blooms = MARK_LOBES.map((lobe, i) => {
        const r = lobe.r * W * scale
        /* The highlight sits up and slightly left of centre, where the key light would
         * strike a sphere. */
        const cx = lobe.x * W - 0.12 * r
        const cy = lobe.y * H - 0.46 * r
        return `
        <radialGradient id="bloom${i}" gradientUnits="userSpaceOnUse"
                        cx="${cx}" cy="${cy}" r="${r * 0.98}">
          <stop offset="0"    stop-color="${palette.glint}" stop-opacity="${alpha}"/>
          <stop offset="0.42" stop-color="${palette.glint}" stop-opacity="${alpha * 0.38}"/>
          <stop offset="1"    stop-color="${palette.glint}" stop-opacity="0"/>
        </radialGradient>`
    }).join("")

    const bloomRects = MARK_LOBES
        .map((_, i) => `<rect x="${-pad}" y="${-pad}" width="${W + pad * 2}" height="${H + pad * 2}" fill="url(#bloom${i})"/>`)
        .join("")

    const glints = MARK_LOBES.map((lobe) => {
        const r = lobe.r * W
        const cx = lobe.x * W - 0.58 * r
        const cy = lobe.y * H - 0.58 * r
        return `<ellipse cx="0" cy="0" rx="${0.19 * r}" ry="${0.075 * r}"
                 transform="translate(${cx} ${cy}) rotate(-45)"
                 fill="${palette.glint}" fill-opacity="0.9" filter="url(#soft)"/>`
    }).join("")

    const cast = shadow ? `
    <filter id="cast" x="-40%" y="-40%" width="180%" height="200%">
      <feGaussianBlur stdDeviation="3.4"/>
    </filter>` : ""

    const castMark = shadow ? `
  <g transform="translate(0 2.6)" opacity="0.38" filter="url(#cast)">
    <path d="${d}" fill="#000000" fill-rule="evenodd"/>
  </g>` : ""

    return `<svg xmlns="http://www.w3.org/2000/svg"${placed} viewBox="${vb}" width="${svgW}" height="${svgH}">
  <defs>
    ${bodyRamps}
    ${blooms}
    <clipPath id="mark"><path d="${d}" clip-rule="evenodd"/></clipPath>
    <filter id="rim"  x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2"/>
    </filter>
    <filter id="edge" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
    <filter id="soft" x="-200%" y="-200%" width="500%" height="500%">
      <feGaussianBlur stdDeviation="0.7"/>
    </filter>
    ${cast}
  </defs>
  ${castMark}
  <g clip-path="url(#mark)">
    ${bodyFills}
    ${bloomRects}

    <!-- Rim light: a thick stroke of each counter nudged up-left, so only its
         bottom-right arc survives the clip. The counter-edge mirrors it. -->
    <g transform="translate(-1.6 -1.6)" filter="url(#rim)">
      ${MARK_PATHS.map((path) => `<path d="${path}" fill="none" stroke="${withAlpha(palette.rim, 0.85)}" stroke-width="4.5"/>`).join("")}
    </g>
    <g transform="translate(1.8 1.8)" filter="url(#edge)">
      ${MARK_PATHS.map((path) => `<path d="${path}" fill="none" stroke="${withAlpha("#000000", 0.22)}" stroke-width="5.5"/>`).join("")}
    </g>

    ${glints}
  </g>
</svg>`
}

/**
 * A square of the icon's vertical gradient, edge to edge.
 *
 * No rounded corners on purpose: both platforms apply their own mask — iOS a superellipse,
 * Android whatever shape the OEM picked — and corners baked in here would show up as dark
 * notches inside that mask.
 */
function gradientFieldSvg(size) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>${FIELD_GRADIENT_DEF(size)}</defs>
  <rect width="${size}" height="${size}" fill="url(#field)"/>
</svg>`
}

/** The field ramp, spanning the full canvas height. */
const FIELD_GRADIENT_DEF = (size) => `
    <linearGradient id="field" x1="0" y1="0" x2="0" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${ICON_FIELD.top}"/>
      <stop offset="1" stop-color="${ICON_FIELD.bottom}"/>
    </linearGradient>`

/**
 * The whole launcher icon as one document: gradient field, glossy mark centred on top.
 *
 * Built as a single SVG rather than composited from two bitmaps so the mark's edge is
 * antialiased against the gradient itself. Compositing a separately-rasterized mark would
 * blend its edge pixels against whatever flat colour the canvas was created with, leaving a
 * faint halo wherever the gradient had moved away from it.
 */
function iconSvg(size, markScale, palette) {
    const pad = BLEED * W
    const markWidth = size * markScale
    const scale = markWidth / W
    const markHeight = markWidth * (H / W)
    const nestedW = (W + pad * 2) * scale
    const nestedH = (H + pad * 2) * scale
    const x = (size - markWidth) / 2 - pad * scale
    const y = (size - markHeight) / 2 - pad * scale

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>${FIELD_GRADIENT_DEF(size)}</defs>
  <rect width="${size}" height="${size}" fill="url(#field)"/>
  ${markSvg(palette, { shadow: true, x, y, width: nestedW, height: nestedH })}
</svg>`
}

/** Rasterizes a self-contained square SVG at `size` px. */
function renderSquare(svg, size) {
    return sharp(Buffer.from(svg), { density: 512 })
        .resize({ width: size, height: size })
        .png()
        .toBuffer()
}

/**
 * Rasterizes the mark so its **outline** is `width` px wide.
 *
 * The SVG is padded by `BLEED` so the gloss has room; this renders the padded document
 * proportionally larger and returns the bitmap plus the offset of the outline's origin
 * inside it, which is what callers need to place the mark by its true bounding box.
 */
async function renderMark(svg, width) {
    const total = Math.round(width * (1 + BLEED * 2))
    const buffer = await sharp(Buffer.from(svg), { density: 512 })
        .resize({ width: total })
        .png()
        .toBuffer()
    return { buffer, total, inset: Math.round((total - width) / 2) }
}

/**
 * Composites the mark, centred horizontally and at `centerY` vertically, onto a canvas.
 *
 * `background` of `null` leaves it transparent — the adaptive foreground layer, where
 * Android supplies the background itself.
 *
 * `typeFill` adds the wordmark at the foot of the canvas. Splash only: the adaptive
 * foreground is the mark alone.
 */
async function compose({ svg, width, height, markWidth, centerY = 0.5, background, typeFill }) {
    const { buffer, total } = await renderMark(svg, markWidth)
    const markHeight = markWidth * (H / W)

    /* Place by the outline's box, then step back by the bleed so the padded bitmap lands
     * with its outline where the outline was meant to go. */
    const bleedPx = (total - markWidth) / 2
    const left = Math.round((width - markWidth) / 2 - bleedPx)
    const top = Math.round(height * centerY - markHeight / 2 - bleedPx)

    const layers = [{ input: buffer, left, top }]

    if (typeFill) {
        const typeWidth = Math.round(Math.min(width, height) * SPLASH_TYPE_SCALE)
        const wordmark = await renderTypeLogo(withAlpha(typeFill, SPLASH_TYPE_OPACITY), typeWidth)
        layers.push({
            input: wordmark.buffer,
            left: Math.round((width - wordmark.width) / 2),
            top: Math.round(height - wordmark.height - height * SPLASH_TYPE_BOTTOM),
        })
    }

    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
        },
    })
        .composite(layers)
        .png()
        .toBuffer()
}

/** Masks a square PNG to a circle, for Android's `ic_launcher_round`. */
async function circleMask(png, size) {
    const circle = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
            <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>
        </svg>`,
    )
    return sharp(png).composite([{ input: circle, blend: "dest-in" }]).png().toBuffer()
}

async function write(file, buffer) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, buffer)
    console.log(`  ${path.relative(ROOT, file)}`)
}

async function buildIos(splashSvg, iconPalette) {
    console.log("\niOS")

    /* The App Store rejects an icon with an alpha channel. The gradient is opaque already,
     * so `flatten` only strips the channel rather than changing any pixel. */
    await write(
        path.join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"),
        await sharp(await renderSquare(iconSvg(1024, IOS_SCALE, iconPalette), 1024))
            .flatten({ background: ICON_FIELD.bottom })
            .png()
            .toBuffer(),
    )

    const splash = (background, typeFill) => compose({
        svg: splashSvg,
        width: 2732,
        height: 2732,
        markWidth: 2732 * SPLASH_SCALE,
        centerY: SPLASH_CENTER_Y,
        background,
        typeFill,
    })

    /* Capacitor's imageset references six filenames — the base plus `-1`/`-2` for the
     * @2x/@3x slots, and a `-dark` family. The art is resolution-independent, so the three
     * slots within an appearance share a bitmap; the two appearances do not. */
    const dir = path.join(ROOT, "ios/App/App/Assets.xcassets/Splash.imageset")

    const light = await splash(SPLASH_BG, SPLASH_TYPE_FILL)
    for (const name of ["splash-2732x2732", "splash-2732x2732-1", "splash-2732x2732-2"]) {
        await write(path.join(dir, `${name}.png`), light)
    }

    const dark = await splash(SPLASH_DARK_BG, SPLASH_TYPE_FILL)
    for (const name of [
        "splash-2732x2732-dark",
        "splash-2732x2732-dark-1",
        "splash-2732x2732-dark-2",
    ]) {
        await write(path.join(dir, `${name}.png`), dark)
    }
}

async function buildAndroid(splashSvg, iconPalette) {
    console.log("\nAndroid")
    const res = path.join(ROOT, "android/app/src/main/res")

    const foregroundSvg = markSvg(iconPalette, { shadow: true })

    for (const { name, legacy, adaptive } of DENSITIES) {
        const dir = path.join(res, `mipmap-${name}`)

        const square = await renderSquare(iconSvg(legacy, LEGACY_SCALE, iconPalette), legacy)
        await write(path.join(dir, "ic_launcher.png"), square)
        await write(path.join(dir, "ic_launcher_round.png"), await circleMask(square, legacy))

        /* The adaptive layers are separate files because Android animates them independently
         * — the launcher slides the foreground against the background on scroll. */
        await write(
            path.join(dir, "ic_launcher_foreground.png"),
            await compose({
                svg: foregroundSvg,
                width: adaptive,
                height: adaptive,
                markWidth: adaptive * ADAPTIVE_SCALE,
                background: null,
            }),
        )
        await write(
            path.join(dir, "ic_launcher_background.png"),
            await renderSquare(gradientFieldSvg(adaptive), adaptive),
        )
    }

    /* The adaptive background is a *bitmap* now, not `@color/ic_launcher_background`: a
     * colour resource is one flat value and cannot hold a gradient. These two XMLs are
     * rewritten to point at the mipmap so the adaptive icon matches the legacy and iOS ones
     * instead of being the only variant without the field.
     *
     * The colour resource is kept and set to the gradient's midpoint. Nothing references it
     * once these XMLs are repointed, but Android Studio's icon tooling and some launcher
     * previews still read it, and a stale brand colour there would be a trap later. */
    for (const file of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
        await write(
            path.join(res, "mipmap-anydpi-v26", file),
            Buffer.from(
                `<?xml version="1.0" encoding="utf-8"?>\n` +
                    `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n` +
                    `    <background android:drawable="@mipmap/ic_launcher_background"/>\n` +
                    `    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n` +
                    `</adaptive-icon>\n`,
            ),
        )
    }

    await write(
        path.join(res, "values/ic_launcher_background.xml"),
        Buffer.from(
            `<?xml version="1.0" encoding="utf-8"?>\n` +
                `<resources>\n` +
                `    <color name="ic_launcher_background">${ICON_BG}</color>\n` +
                `</resources>\n`,
        ),
    )

    /* Splash drawables. `drawable/` and `drawable-night/` are the fallbacks the template
     * points at; the port-/land- buckets are what a real device actually loads. The mark
     * is sized off the canvas *width* in both orientations so it keeps one physical size
     * as the device rotates. */
    for (const [suffix, background] of [["", SPLASH_BG], ["-night", SPLASH_DARK_BG]]) {
        await write(
            path.join(res, `drawable${suffix}/splash.png`),
            await compose({
                svg: splashSvg,
                width: 1280,
                height: 1920,
                markWidth: 1280 * SPLASH_SCALE,
                centerY: SPLASH_CENTER_Y,
                background,
                typeFill: SPLASH_TYPE_FILL,
            }),
        )

        for (const density of SPLASH_DENSITIES) {
            for (const orientation of ["port", "land"]) {
                const [w, h] = density[orientation]
                await write(
                    path.join(res, `drawable-${orientation}${suffix}-${density.name}/splash.png`),
                    await compose({
                        svg: splashSvg,
                        width: w,
                        height: h,
                        markWidth: Math.min(w, h) * SPLASH_SCALE,
                        centerY: SPLASH_CENTER_Y,
                        background,
                        typeFill: SPLASH_TYPE_FILL,
                    }),
                )
            }
        }
    }
}

/* Google Play's two listing graphics. They are not launcher assets: nothing reads them at
 * runtime and nothing syncs them into the native projects, but they are generated here so
 * they take their outline and their gloss from `src/lib/mark.js` like everything else and
 * cannot drift from the icon they sit beside in the store.
 *
 * The feature graphic is a fixed 1024x500 that Play scales down and, on some surfaces,
 * crops toward the centre, so the mark and the wordmark are stacked in the middle third
 * and the outer margins are left empty. The wordmark is drawn at full opacity here rather
 * than the splash's half: on a splash it is a caption under the mark, and on a store shelf
 * it is the name of the app. */
const STORE_DIR = path.join(ROOT, "store/play")
const FEATURE = { width: 1024, height: 500 }
const FEATURE_MARK_SCALE = 0.17
const FEATURE_MARK_CENTER_Y = 0.40
const FEATURE_TYPE_SCALE = 0.28
const FEATURE_TYPE_CENTER_Y = 0.70

async function buildStore(iconPalette) {
    console.log("\nPlay Store")

    /* Play rejects an icon with an alpha channel, the same rule the App Store applies.
     * The field is opaque already, so `flatten` only drops the channel. */
    await write(
        path.join(STORE_DIR, "icon-512.png"),
        await sharp(await renderSquare(iconSvg(512, IOS_SCALE, iconPalette), 512))
            .flatten({ background: ICON_FIELD.bottom })
            .png()
            .toBuffer(),
    )

    const { width, height } = FEATURE
    const markWidth = Math.round(width * FEATURE_MARK_SCALE)
    const mark = await renderMark(markSvg(iconPalette), markWidth)
    const markHeight = markWidth * (H / W)
    const bleedPx = (mark.total - markWidth) / 2
    const wordmark = await renderTypeLogo(SPLASH_TYPE_FILL, Math.round(width * FEATURE_TYPE_SCALE))

    await write(
        path.join(STORE_DIR, "feature-graphic.png"),
        await sharp({
            create: { width, height, channels: 4, background: SPLASH_DARK_BG },
        })
            .composite([
                {
                    input: mark.buffer,
                    left: Math.round((width - markWidth) / 2 - bleedPx),
                    top: Math.round(height * FEATURE_MARK_CENTER_Y - markHeight / 2 - bleedPx),
                },
                {
                    input: wordmark.buffer,
                    left: Math.round((width - wordmark.width) / 2),
                    top: Math.round(height * FEATURE_TYPE_CENTER_Y - wordmark.height / 2),
                },
            ])
            .png()
            .toBuffer(),
    )
}

async function main() {
    const palette = paletteFor("jungle")
    console.log(
        `Generating icons — ${palette.key} gloss at ${IOS_SCALE} on a ` +
            `${ICON_FIELD.top} → ${ICON_FIELD.bottom} field, ` +
            `splash "${palette.key}" on ${SPLASH_BG} / ${SPLASH_DARK_BG}`,
    )
    await loadTypeLogo()
    const splashSvg = markSvg(palette)
    await buildIos(splashSvg, palette)
    await buildAndroid(splashSvg, palette)
    await buildStore(palette)
    console.log("\nDone. Run `npm run sync` to push these into the native projects.")
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
