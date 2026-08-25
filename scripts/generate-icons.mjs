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
 * The **icon** is a flat green mark on a dark gradient field — no lighting model.
 * The **splash** is the blown-glass mark the login screen animates, because it gets a whole
 * screen where specular highlights read as material rather than as noise.
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
 *   splash                       mark 0.159 of canvas width, center at y = 0.40
 *
 * The splash values were measured off the icons this replaced, offset included — the mark
 * sits above the optical centre so it reads correctly with the status bar. The icon values
 * are not: they were raised to 0.72 to fill the field the way Messages and Spotify do.
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
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

import { MARK_LOBES, MARK_PATHS, MARK_SIZE, paletteFor } from "../src/lib/mark.js"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { width: W, height: H } = MARK_SIZE

/* The launcher icon is a flat green mark on a dark gradient field — the Spotify
 * arrangement, inverted from the Messages one it replaced.
 *
 * **The gradient belongs to the field, and the mark stays flat.** Putting the ramp on the
 * mark instead was tried and dropped: its lower stop had to darken to read as a gradient at
 * all, and darkening green against black is exactly where contrast is scarcest, so the
 * bottom of the mark started dissolving into the field.
 *
 * So the field carries it. `#052B22` is the brand hue at oklch L=0.26 — dark enough to read
 * as black at a glance, light enough that the ramp down to true black is visible at icon
 * size. The flat mark holds 6.3:1 against the top of that field and 8.7:1 against the
 * bottom, so it stays crisp over the whole run.
 *
 * No gloss either: the icon renders at 48px, behind an OEM mask, next to thirty other
 * icons, where specular highlights read as noise rather than as material. The splash keeps
 * the gloss, because it gets a whole screen. */
const ICON_MARK = "#2BBB9C"
const ICON_FIELD = { top: "#052B22", bottom: "#000000" }

/* The adaptive icon's colour-resource fallback: the field's midpoint. See buildAndroid. */
const ICON_BG = "#031510"

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

/**
 * Builds the glossy mark as a standalone SVG document.
 *
 * Mirrors `paintMark` in `<GlossyMark/>`: body ramp along the top-left → bottom-right
 * light axis, a specular bloom over each lobe (the trailing one catches less), a rim light
 * offset up-left so its glow lands bottom-right, a dark counter-edge offset the other way,
 * and a hard glint on each lobe.
 *
 * Containment is a `<clipPath>` here rather than the component's `source-atop`, because
 * SVG clipping antialiases — it is the canvas version that had to avoid `clip()`.
 */
function markSvg(palette) {
    const pad = BLEED * W
    const vb = `${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`
    const d = MARK_PATHS.join(" ")

    const bodyStops = palette.body
        .map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`)
        .join("")

    const { alpha, scale } = palette.bloom
    const blooms = MARK_LOBES.map((lobe, i) => {
        const r = lobe.r * W * scale
        /* The highlight sits up and slightly left of centre, where the key light would
         * strike a sphere. */
        const cx = lobe.x * W - 0.12 * r
        const cy = lobe.y * H - 0.46 * r
        const strength = i === 0 ? alpha : alpha * 0.78
        return `
        <radialGradient id="bloom${i}" gradientUnits="userSpaceOnUse"
                        cx="${cx}" cy="${cy}" r="${r * 0.98}">
          <stop offset="0"    stop-color="${palette.glint}" stop-opacity="${strength}"/>
          <stop offset="0.42" stop-color="${palette.glint}" stop-opacity="${strength * 0.38}"/>
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

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${W + pad * 2}" height="${H + pad * 2}">
  <defs>
    <linearGradient id="body" gradientUnits="userSpaceOnUse"
                    x1="${-0.05 * W}" y1="${-0.08 * H}" x2="${1.02 * W}" y2="${1.06 * H}">
      ${bodyStops}
    </linearGradient>
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
  </defs>

  <g clip-path="url(#mark)">
    <rect x="${-pad}" y="${-pad}" width="${W + pad * 2}" height="${H + pad * 2}" fill="url(#body)"/>
    ${bloomRects}

    <!-- Rim light: a thick stroke of the outline nudged up-left, so only its
         bottom-right arc survives the clip. The counter-edge mirrors it. -->
    <g transform="translate(-1.6 -1.6)" filter="url(#rim)">
      <path d="${d}" fill="none" stroke="${withAlpha(palette.rim, 0.85)}" stroke-width="4.5"/>
    </g>
    <g transform="translate(1.8 1.8)" filter="url(#edge)">
      <path d="${d}" fill="none" stroke="${withAlpha("#000000", 0.22)}" stroke-width="5.5"/>
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
 * The mark alone, flat, on transparency — Android's adaptive foreground layer, which the
 * launcher composites over the background itself.
 *
 * Shares `markSvg`'s padded viewBox so `compose` places it identically; nothing bleeds into
 * that padding here.
 */
function flatMarkSvg(fill) {
    const pad = BLEED * W
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}" width="${W + pad * 2}" height="${H + pad * 2}">
  <path d="${MARK_PATHS.join(" ")}" fill="${fill}" fill-rule="evenodd"/>
</svg>`
}

/**
 * The whole launcher icon as one document: gradient field, mark centred on top.
 *
 * Built as a single SVG rather than composited from two bitmaps so the mark's edge is
 * antialiased against the gradient itself. Compositing a separately-rasterized mark would
 * blend its edge pixels against whatever flat colour the canvas was created with, leaving a
 * faint halo wherever the gradient had moved away from it.
 */
function iconSvg(size, markScale) {
    const markWidth = size * markScale
    const scale = markWidth / W
    const left = (size - markWidth) / 2
    const top = (size - markWidth * (H / W)) / 2

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>${FIELD_GRADIENT_DEF(size)}</defs>
  <rect width="${size}" height="${size}" fill="url(#field)"/>
  <g transform="translate(${left} ${top}) scale(${scale})">
    <path d="${MARK_PATHS.join(" ")}" fill="${ICON_MARK}" fill-rule="evenodd"/>
  </g>
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
 */
async function compose({ svg, width, height, markWidth, centerY = 0.5, background }) {
    const { buffer, total } = await renderMark(svg, markWidth)
    const markHeight = markWidth * (H / W)

    /* Place by the outline's box, then step back by the bleed so the padded bitmap lands
     * with its outline where the outline was meant to go. */
    const bleedPx = (total - markWidth) / 2
    const left = Math.round((width - markWidth) / 2 - bleedPx)
    const top = Math.round(height * centerY - markHeight / 2 - bleedPx)

    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
        },
    })
        .composite([{ input: buffer, left, top }])
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

async function buildIos(splashSvg) {
    console.log("\niOS")

    /* The App Store rejects an icon with an alpha channel. The gradient is opaque already,
     * so `flatten` only strips the channel rather than changing any pixel. */
    await write(
        path.join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"),
        await sharp(await renderSquare(iconSvg(1024, IOS_SCALE), 1024))
            .flatten({ background: ICON_FIELD.bottom })
            .png()
            .toBuffer(),
    )

    const splash = (background) => compose({
        svg: splashSvg,
        width: 2732,
        height: 2732,
        markWidth: 2732 * SPLASH_SCALE,
        centerY: SPLASH_CENTER_Y,
        background,
    })

    /* Capacitor's imageset references six filenames — the base plus `-1`/`-2` for the
     * @2x/@3x slots, and a `-dark` family. The art is resolution-independent, so the three
     * slots within an appearance share a bitmap; the two appearances do not. */
    const dir = path.join(ROOT, "ios/App/App/Assets.xcassets/Splash.imageset")

    const light = await splash(SPLASH_BG)
    for (const name of ["splash-2732x2732", "splash-2732x2732-1", "splash-2732x2732-2"]) {
        await write(path.join(dir, `${name}.png`), light)
    }

    const dark = await splash(SPLASH_DARK_BG)
    for (const name of [
        "splash-2732x2732-dark",
        "splash-2732x2732-dark-1",
        "splash-2732x2732-dark-2",
    ]) {
        await write(path.join(dir, `${name}.png`), dark)
    }
}

async function buildAndroid(splashSvg) {
    console.log("\nAndroid")
    const res = path.join(ROOT, "android/app/src/main/res")

    const foregroundSvg = flatMarkSvg(ICON_MARK)

    for (const { name, legacy, adaptive } of DENSITIES) {
        const dir = path.join(res, `mipmap-${name}`)

        const square = await renderSquare(iconSvg(legacy, LEGACY_SCALE), legacy)
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
     * instead of being the only flat-green variant.
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
                    }),
                )
            }
        }
    }
}

async function main() {
    const splashPalette = paletteFor("jungle")
    console.log(
        `Generating icons — flat ${ICON_MARK} at ${IOS_SCALE} on a ` +
            `${ICON_FIELD.top} → ${ICON_FIELD.bottom} field, ` +
            `splash "${splashPalette.key}" on ${SPLASH_BG} / ${SPLASH_DARK_BG}`,
    )
    /* Flat mark on a gradient field for the icon, glossy mark for the splash. */
    const splashSvg = markSvg(splashPalette)
    await buildIos(splashSvg)
    await buildAndroid(splashSvg)
    console.log("\nDone. Run `npm run sync` to push these into the native projects.")
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
