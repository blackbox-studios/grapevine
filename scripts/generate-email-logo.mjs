/**
 * Renders the email logo and uploads it to Supabase Storage.
 *
 *     node scripts/generate-email-logo.mjs
 *
 * WHY THIS IS A HOSTED BITMAP AND NOT MARKUP
 *
 * Every other surface draws the mark from `src/lib/mark.js` directly — `<GlossyMark/>` to a
 * canvas, `generate-icons.mjs` to SVG. Email can do neither. Gmail strips `<svg>` outright,
 * blocks `data:` URIs in `src`, and supports no CSS that could draw this outline. A raster
 * image at an absolute `https://` URL is the only thing every client renders, so the mark has
 * to be baked and parked somewhere public.
 *
 * That somewhere is the "media" Storage bucket rather than `public/`, because the email is
 * sent by Supabase and read long before — and independently of — any web deploy. A logo
 * pointing at throughgrapevine.com would 404 in every sign-in email until the site ships, and
 * would break again during any window where it is down. The bucket is public-read already
 * (see `src/lib/server/storage.js`) and is up whenever auth is up, since it is the same
 * project.
 *
 * `brand/` is a deliberate third prefix beside `posts/` and `avatars/`, and the only one
 * whose path is guessable on purpose: these bytes are a logo, so there is nothing for an
 * opaque path to protect. `upsert` keeps the URL stable across re-runs, which matters because
 * the URL is pasted into a dashboard template this script cannot reach.
 *
 * THE LOOK
 *
 * The app icon, corners included: the mark on a black field. It reads as the app
 * rather than as a wordmark, and being self-contained on its own dark field it needs no
 * assumption about the client's background — which is what keeps it correct in a dark-mode
 * inbox and a light one without a second asset.
 *
 * Re-run after changing the mark or the palettes in `src/lib/mark.js`; the email template at
 * `supabase/templates/magic-link.html` already points at the URL this prints.
 */

import { Buffer } from "node:buffer"

import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"

import { MARK_PATHS, MARK_SIZE } from "../src/lib/mark.js"

const { width: W, height: H } = MARK_SIZE

/* Kept in step with generate-icons.mjs by hand — the icon and the email logo are the same
 * artwork, and a divergence here would show up as two different-looking Grapevines. */
const MARK = "#2BBB9C"
const FIELD = { top: "#000000", bottom: "#000000" }
const MARK_SCALE = 0.62

/* 144px for a 72px slot: the retina copy. Email cannot ask for a 2x asset the way `srcset`
 * does, so the file is rendered at 2x and the template pins the display size in HTML
 * attributes — the only sizing mechanism Outlook honours reliably. */
const SIZE = 144
const RADIUS = 0.2237 * SIZE   /* iOS's superellipse, as close as a rounded rect gets. */

const BUCKET = "media"
const OBJECT = "brand/email-mark.png"

const iconSvg = () => {
    const markWidth = SIZE * MARK_SCALE
    const scale = markWidth / W
    const left = (SIZE - markWidth) / 2
    const top = (SIZE - markWidth * (H / W)) / 2

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="field" x1="0" y1="0" x2="0" y2="${SIZE}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${FIELD.top}"/>
      <stop offset="1" stop-color="${FIELD.bottom}"/>
    </linearGradient>
    <clipPath id="tile">
      <rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#tile)">
    <rect width="${SIZE}" height="${SIZE}" fill="url(#field)"/>
    <g transform="translate(${left} ${top}) scale(${scale})">
      <path d="${MARK_PATHS.join(" ")}" fill="${MARK}" fill-rule="evenodd"/>
    </g>
  </g>
</svg>`
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !secret) {
    console.error("✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.")
    process.exit(1)
}

const png = await sharp(Buffer.from(iconSvg()), { density: 512 }).png().toBuffer()
console.log(`  rendered ${SIZE}x${SIZE} — ${(png.length / 1024).toFixed(1)} KB`)

const supabase = createClient(url, secret, { auth: { persistSession: false } })

const { error } = await supabase.storage
    .from(BUCKET)
    .upload(OBJECT, png, { contentType: "image/png", upsert: true, cacheControl: "31536000" })

if (error) {
    console.error(`✗ Upload failed: ${error.message}`)
    if (/bucket/i.test(error.message)) console.error("  Run `npm run storage:setup` first.")
    process.exit(1)
}

const { data } = supabase.storage.from(BUCKET).getPublicUrl(OBJECT)
console.log(`\n✓ Uploaded. Public URL:\n\n${data.publicUrl}\n`)
console.log("  This is the URL in supabase/templates/magic-link.html.")
