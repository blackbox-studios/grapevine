"use client"

import PageTransition from "@/components/PageTransition"

/* The shared frame around the settings tree — the account surface at `/settings` itself and
 * the sub-pages under it — and nothing more.
 *
 * **There is no tab rail here.** A fixed 10rem column of pill links used to sit to the left of
 * every settings page, which worked on a desktop and pushed the roster table clean off the
 * right edge of a phone — a grid track has `min-width: auto`, so the table could never shrink
 * into its own horizontal scroller and the whole page overflowed instead. Those destinations
 * are now rows on `/settings` itself, which is one list at every width and is also where
 * logging out is, so the account surface answers "where do I go from here" in one place — and
 * being the *index* rather than a sibling is what makes the back arrow on General and Users
 * point at a real parent instead of at a route in another tree.
 *
 * `min-w-0` is what is left of that lesson: it lets a wide child — the roster table — resolve
 * to its container's width and scroll sideways inside itself, rather than forcing this column
 * wider than the viewport.
 *
 * The nested <PageTransition/> stays, and `/settings` stays in NESTED_TRANSITION_ROUTES with
 * it: this wrapper persists across the index ↔ General ↔ Users, so the pages cross-fade
 * against a frame that does not move, and the top-level transition leaves the tree alone. */
const SettingsLayout = ({ children }) => (
    <div className="min-w-0 pb-10 md:pt-0">
        <PageTransition initial={false}>{children}</PageTransition>
    </div>
)

export default SettingsLayout
