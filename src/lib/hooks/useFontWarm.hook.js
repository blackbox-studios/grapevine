"use client"

import { useEffect } from "react"

import { whenIdle } from "@/lib/utils"

/* Pull the Daily Read's face down while the reader is somewhere else, so /prologue paints
 * in PT Serif rather than swapping into it a moment after it opens.
 *
 * **A face belongs in this list when exactly one screen sets it.** The other two the app
 * ships are on the shell — Material Symbols draws the nav's icons and Babe Sans every h1 —
 * so the browser has already asked for them by the time an idle callback could run, and
 * naming them here would buy nothing while implying the list is the app's font manifest.
 *
 * `document.fonts.load` rather than a `<link rel="preload">` in the document head, for two
 * reasons. The @font-face URLs in globals.css are bundled, so their emitted filenames carry
 * a build hash that no hand-written `href` can name — the font stack is the only stable way
 * to point at them. And a head preload is fetched at high priority against the very screen
 * it is not for; this waits for an idle moment instead, since the reading is seconds away at
 * the soonest and never on the critical path of whatever is on screen now.
 *
 * All four cuts, because the page sets headings bold and hymn attributions italic, and a
 * swap on one of them is as visible as a swap on the body. */
const READING_FACES = [
    "400 1rem 'PT Serif Caption'",
    "700 1rem 'PT Serif Caption'",
    "italic 400 1rem 'PT Serif Caption'",
    "italic 700 1rem 'PT Serif Caption'",
]

export default function useFontWarm(enabled) {
    useEffect(() => {
        if (!enabled || !document.fonts) return

        return whenIdle(() => {
            /* A rejection here is a font that will simply swap in later, as it does today. */
            for (const face of READING_FACES) document.fonts.load(face).catch(() => {})
        })
    }, [enabled])
}
