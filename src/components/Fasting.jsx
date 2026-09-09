"use client"

import DairyIcon from "@/assets/svg/icons/fast-dairy.svg"
import FishIcon from "@/assets/svg/icons/fast-fish.svg"
import MeatIcon from "@/assets/svg/icons/fast-meat.svg"
import OilIcon from "@/assets/svg/icons/fast-oil.svg"
import WineIcon from "@/assets/svg/icons/fast-wine.svg"
import Hint from "@/components/Hint"
import { cn } from "@/lib/utils"

/* What the Church keeps on a day: five glyphs and a sentence.
 *
 * Two surfaces read the same rule and read it differently, which is why the pieces are exported
 * separately rather than there being one component with a variant on it. The Daily Read is a page
 * somebody sits and reads, so the row is an ornament and the sentence is its accessible name;
 * `<SignupClaim/>` is a form somebody is filling in three Sundays ahead of a fast, so the sentence
 * is the point and is printed. What both must share is the *rule* — the split into permitted and
 * forbidden, and the words for it — because two surfaces that computed it apart could disagree
 * about the same Wednesday.
 *
 * The rule itself comes from orthocal.info by way of `/api/prologue` and `/api/fasting`, and is
 * absent whenever that service could not be reached: every caller renders nothing rather than
 * failing, since neither surface is about the fast. */

/* The five things a fast is reckoned in, and the icon for each.
 *
 * `covers` is what makes this a display list rather than a mirror of orthocal's: that API
 * counts eggs separately, but no icon reads as "eggs" beside a cheese wedge and the two are
 * lifted and laid down together on every day in the calendar, so dairy stands for both. A
 * category is allowed only when nothing it covers is being abstained from. */
const FAST_CATEGORIES = [
    { key: "meat", label: "meat", Icon: MeatIcon, covers: ["meat"] },
    { key: "dairy", label: "dairy", Icon: DairyIcon, covers: ["dairy", "eggs"] },
    { key: "fish", label: "fish", Icon: FishIcon, covers: ["fish"] },
    { key: "wine", label: "wine", Icon: WineIcon, covers: ["wine"] },
    { key: "oil", label: "oil", Icon: OilIcon, covers: ["oil"] },
]

/* The day's rule as two lists. One derivation for every surface, so the glyphs a reader sees on
 * the Daily Read and the sentence they see on a sign-up sheet are the same fact. */
export const fastingSplit = (fasting) => {
    const abstain = new Set(fasting?.abstain ?? [])
    const allowed = FAST_CATEGORIES.filter(
        (category) => !category.covers.some((item) => abstain.has(item)),
    )
    return { allowed, forbidden: FAST_CATEGORIES.filter((category) => !allowed.includes(category)) }
}

/* "meat, dairy, or fish" — the conjunction is a parameter because the same helper writes
 * both halves of the sentence, and a list of what is forbidden joins on "or" while a list of
 * what is permitted joins on "and". */
const listOf = (items, conjunction) => {
    if (items.length <= 1) return items[0] ?? ""
    if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
    return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items.at(-1)}`
}

/* The rule in a sentence, because the icons alone cannot say whether a lit row means a
 * feast or a mistake. Written from the same `allowed` split that lights them, so the words
 * and the glyphs can never disagree — which is also why orthocal's own `fast_exception_desc`
 * is not printed alongside: "Wine and Oil Allowed" is the same fact this sentence already
 * states in plainer words, and two phrasings of one rule read as two rules.
 *
 * `subject` is what the sentence is about, and it is a parameter because the second surface is
 * not about today: somebody taking a date in three weeks is being told about that day, and
 * "Today is a fast" over a form headed with another date is simply wrong. */
export const fastingSentence = ({ allowed, forbidden }, subject = "Today") => {
    if (!forbidden.length) return `${subject} is fast-free.`

    const labels = (list) => list.map((category) => category.label)

    if (!allowed.length) {
        return `${subject} is a strict fast: no ${listOf(labels(forbidden), "or")}.`
    }

    const permitted = listOf(labels(allowed), "and")
    const verb = allowed.length > 1 ? "are" : "is"

    return `${subject} is a fast: no ${listOf(labels(forbidden), "or")}. ${
        permitted.charAt(0).toUpperCase() + permitted.slice(1)
    } ${verb} allowed.`
}

/* The five glyphs. **Lit means permitted.**
 *
 * ── Two things the five glyphs have to keep ──────────────────────────────────
 *
 * **Each is a single `<path>` and none of them strokes.** They are built from overlapping
 * pieces — a drumstick is a ball, a bone and two knuckles — and anything that rasterises those
 * pieces separately gives each its own anti-aliased edge, so a pale hairline shows wherever two
 * meet. Separate elements do that, and so does `fill` plus `stroke` on one element, which is
 * two passes over the same path. Both are invisible in a browser at a desktop pixel ratio and
 * plainly visible in the WebView, which is the only place this row is really read. So each
 * glyph is drawn at its finished size and filled once, and its pieces are subpaths wound the
 * same way so they union under `nonzero` — wind one against the others and the overlap punches
 * a hole instead.
 *
 * **They carry about the same ink**, 29-37% of their box. This row says *permitted* by lighting
 * a glyph and *forbidden* by dimming it, so one that is inherently lighter than its neighbours
 * reads as half-dimmed and argues with the only signal the row sends.
 *
 * Presentational throughout: the glyphs are ornaments rather than controls, so the row is hidden
 * from a screen reader and whoever draws it is responsible for putting the sentence in words. */
export const FastingIcons = ({ allowed, className, iconClassName }) => (
    <div aria-hidden="true" className={cn("flex items-center justify-center gap-7", className)}>
        {FAST_CATEGORIES.map((category) => (
            <category.Icon
                key={category.key}
                className={cn(
                    "size-9 transition-colors duration-300",
                    iconClassName,
                    allowed.includes(category) ? "text-foreground" : "text-muted-foreground/40",
                )}
            />
        ))}
    </div>
)

/* The Daily Read's strip: the glyphs, with the sentence behind them.
 *
 * Drawn as a bare row rather than a card: it opens the reading and is part of it, so a
 * bordered box would fence it off as a widget the page had imported from somewhere else.
 *
 * The whole row is one labelled image to a screen reader, and the sentence is on the `<Hint/>`
 * for anyone the colour does not reach. A button rather than a list, because the row has to
 * answer to the keyboard and to a screen reader on its own and a `<ul>` could not be the
 * trigger without nesting flow content in a button. */
const Fasting = ({ fasting }) => {
    if (!fasting) return null

    const split = fastingSplit(fasting)
    const sentence = fastingSentence(split)

    return (
        <aside className="flex justify-center py-2">
            <Hint content={sentence} className="font-reading">
                <button
                    type="button"
                    aria-label={sentence}
                    className="rounded-lg px-2 py-1 outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                    <FastingIcons allowed={split.allowed} />
                </button>
            </Hint>
        </aside>
    )
}

export default Fasting
