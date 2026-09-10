# Brand Assets — what changing the icon actually costs

> **Purpose.** The blast radius of "let's change the app icon". Read this *before* starting,
> because the expensive part is not the drawing — it is the ten places the mark exists that
> `npm run icons` does not own, and which fail quietly and separately when they drift.
>
> Companion: `scripts/generate-icons.mjs`, whose header explains *how* the generator works
> and what the proportions mean. This document is about what it does **not** cover.

---

## TL;DR

`npm run icons` regenerates **52 files** from one outline. It does not touch **ten other
places** the mark, its colour, or its silhouette also live. A change that only runs the
script ships an app whose launcher icon, browser tab, and notification tray disagree.

| | |
|---|---|
| Generated | 52 files — 45 Android, 7 iOS |
| Hand-maintained | `favicon.svg`, `ic_notification.xml`, `colors.xml`, `capacitor.config.json` |
| Second implementations of the same art | 3 (canvas, SVG, favicon) |
| Uploaded outside the repo | 2 store listings, 1 hosted email PNG |
| Decoy files that look generated and are not | 2 (see below) |

---

## The one input

`src/lib/mark.js` is the source of truth for the **outline**:

| Export | What depends on it |
|---|---|
| `MARK_PATHS` | every rendering of the mark, everywhere |
| `MARK_SIZE` | the 139x100 box all placement maths is a fraction of |
| `MARK_LOBES` | where the specular highlights and glints land |
| `MARK_BODY_RAMP` | the light axis, applied per counter so both g's fade the same |
| `MARK_PALETTES` | the gloss ramps, the rim, **and `accent`** — the gateway button colour |

Changing `MARK_PATHS` is the cheap half. Everything below is the other half.

---

## What `npm run icons` regenerates

```bash
npm run icons   # rewrites all 52 files from src/lib/mark.js
npm run sync    # copies them into android/ and ios/ — the script does NOT do this
```

- **iOS** — `AppIcon.appiconset/AppIcon-512@2x.png` (one 1024px file; the modern
  single-size catalog format), and six `Splash.imageset` PNGs (three slots x light/dark).
- **Android** — 20 mipmap PNGs (5 densities x `ic_launcher` / `_round` / `_foreground` /
  `_background`), the two `mipmap-anydpi-v26` adaptive XMLs,
  `values/ic_launcher_background.xml`, and **22 splash PNGs** (2 fallbacks + 5 densities x
  portrait/landscape x day/night).

The outputs are checked in, so a machine without `sharp` can still build. That is also why
a stale generation is invisible: nothing fails, the old art just ships.

> **Two decoy files.** `res/drawable/ic_launcher_background.xml` and
> `res/drawable-v24/ic_launcher_foreground.xml` are Android Studio template leftovers. They
> are named exactly like the real assets, the generator never writes them, and **nothing
> references them** — the adaptive XMLs point at `@mipmap/`, not `@drawable/`. Editing one
> and seeing no change is the trap; they are safe to delete.

---

## What it does NOT touch — the actual cost

### 1. `public/favicon.svg` — a hand-written third copy of the mark

The two `d` attributes in that file are `MARK_PATHS` **pasted by hand**, in a 174x174
square viewBox with a `translate(17.5 37)` centring the 139x100 outline. Nothing keeps them
in step. Change the outline and the browser tab keeps the old mark until someone notices.

Its colours are literals too (`#2BBB9C` light, `#ffffff` dark) because a favicon renders in
its own document and inherits neither `currentColor` nor custom properties.

> **Two consecutive hyphens are illegal inside an XML comment.** The file's own comment says
> so, because naming a CSS custom property in it voids the document and the icon silently
> stops rendering. The same trap applies to every XML file listed below.

### 2. `android/app/src/main/res/drawable/ic_notification.xml` — deliberately not the mark

The status-bar icon is a **bell**, hand-authored, and it should stay one. Android >= 5.0
discards every colour in a status-bar icon and keeps only the alpha channel, so the mark
reduced to one flat silhouette is an unrecognisable lump at 24dp. This is the one asset
that should *not* follow a mark change — but it does follow a **colour** change, via
`notification_accent` below.

### 3. `android/app/src/main/res/values/colors.xml` — `notification_accent`

`#2BBB9C`, the brand green — the same `--brand` / jungle 0.72 stop as `globals.css`. The
script rewrites `values/ic_launcher_background.xml` but has no knowledge of this file.

### 4. `capacitor.config.json` — four background colours

`backgroundColor`, `ios.backgroundColor`, `android.backgroundColor`, and
`plugins.SplashScreen.backgroundColor` are all `#0a1014`, which must equal `SPLASH_DARK_BG`
in the generator. They are the colour behind the splash *image*; if they disagree you get a
one-frame flash of the wrong colour on launch, which reads as a stutter rather than as a
colour bug and is correspondingly hard to attribute.

### 5. Three implementations of the same lighting model

The gloss exists three times, and the generator's header is explicit that this is
unavoidable rather than sloppy — Node has no canvas:

| Where | How |
|---|---|
| `src/components/GlossyMark.jsx` | `paintMark` draws to a `<canvas>` per frame |
| `scripts/generate-icons.mjs` | `markSvg` rebuilds it in SVG for librsvg |
| `public/favicon.svg` | flat fill, no lighting at all |

Change the look in one and you must change it in the other. `mark.js` keeps the *inputs*
honest; it cannot keep the two renderers honest.

### 6. `MARK_PALETTES[].accent` is a contrast decision, not a colour

The jungle palette's `accent` is `#16806B`, **not** the brand `#2BBB9C`, and the comment in
`mark.js` says why: the brand green carries only 2.4:1 against white button text. It is the
darkest tone of the same hue clearing 4.5:1 on white while staying above 3:1 on both app
backgrounds. **Re-derive it, don't eyeball it** — it is the gateway button's fill, so a
lazy value here is a WCAG failure on the sign-in screen.

### 7. Store listings — outside the repo entirely

- **Play Console** wants a **512x512** hi-res icon. The generator's largest Android output
  is 432px (adaptive) / 192px (legacy), so **there is no file in this repo to upload.**
- **App Store Connect** takes the 1024 from the asset catalog, but marketing screenshots
  showing the old icon are a separate upload.

### 8. `src/app/layout.jsx`

`icons: { icon: "/favicon.svg" }` — one line, and today that is the whole web icon story.
There is **no** `apple-touch-icon` and **no** PWA manifest. If either is ever added it
becomes another surface on this list.

### 9. The mark in outgoing email — a PNG that is not in this repo at all

Both pieces of mail the app sends put the mark at the top: the sign-in code
(`supabase/templates/magic-link.html`) and the invitation
(`LOGO_URL` in `src/lib/server/invites.js`). Both point at the **same hosted PNG**, in
Supabase Storage rather than on throughgrapevine.com so it cannot 404 during a deploy:

```
media/brand/email-mark.png
```

`node scripts/generate-email-logo.mjs` regenerates and re-uploads it. **Run it, or the new
brand ships everywhere except the two emails a parishioner receives in their first minute**,
which are the first thing a new person ever sees of the app.

It is a raster and it is remote for the same reason: Gmail strips `<svg>` and blocks `data:`
URIs in `src`, so neither the generator's output nor `markSvg` can be inlined. That makes this
the one surface on this list that a `git grep` for the new colour will not find, and the one
that keeps serving the old mark to real people after every other copy has been updated —
including to anybody who opens an email sent months ago.

Both files hard-code the URL rather than importing a constant, so if the object is ever
renamed, both need editing.

---

## The order to do it in

1. Edit `src/lib/mark.js` — the outline, the lobes, the palettes.
2. Reconcile `<GlossyMark/>`'s `paintMark` with `markSvg` if the *look* changed.
3. Re-derive `MARK_PALETTES[].accent` against white and both app backgrounds.
4. `npm run icons`.
5. Hand-edit `public/favicon.svg` — paste the new `MARK_PATHS`, check the literals.
6. Hand-edit `values/colors.xml` if the brand green moved.
7. Reconcile the four `capacitor.config.json` background colours with `SPLASH_DARK_BG`.
8. Decide whether `ic_notification.xml` needs anything (usually: no).
9. `node scripts/generate-email-logo.mjs` — re-upload the mark the two emails point at.
10. `npm run sync`, then build both platforms.
11. Export a 512x512 for Play Console.

**Check the result on a device, not in the file browser.** Android caches launcher icons
aggressively — a reinstall, or a different launcher, is often the only way to see a change.

---

## Why it is like this

Worth stating so nobody "fixes" it into something worse. The duplication is real but each
copy exists for a reason: Node cannot run a canvas, a favicon cannot read a custom property,
and a status-bar icon cannot be the mark. What *could* reasonably be automated is the
favicon and `colors.xml` — both are pure functions of `mark.js` — and doing so would take
this list from ten items to eight. That is the one improvement here worth making, and it
belongs in `scripts/generate-icons.mjs` rather than in a new script.
