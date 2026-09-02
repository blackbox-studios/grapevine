"use client"

import PageTransition from "@/components/PageTransition"

/* The shared frame around the account tree — `/settings` itself and the sub-pages under it —
 * and nothing more.
 *
 * **There is no tab rail here, and there must not be one.** A fixed column of links beside the
 * page is a second expression of the destinations `/settings` already lists, and it cannot fit a
 * phone: a grid track has `min-width: auto`, so a wide child can never shrink into its own
 * horizontal scroller and the page overflows instead. One list, at every width, and being the
 * *index* rather than a sibling is what makes each sub-page's back arrow point at a real parent.
 *
 * The nested <PageTransition/> is why `/settings` is in NESTED_TRANSITION_ROUTES: this wrapper
 * persists across the index and its sub-pages, so they cross-fade against a frame that does not
 * move and the top-level transition leaves the tree alone. */
const SettingsLayout = ({ children }) => (
    <div className="pb-10 md:pt-0">
        <PageTransition initial={false}>{children}</PageTransition>
    </div>
)

export default SettingsLayout
