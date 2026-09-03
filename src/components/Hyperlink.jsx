// Animation for hovering over something that looks like a hyperlink

import NextLink from "next/link"

import { cn } from "@/lib/utils"

/* **The one hover treatment for anything that reads as a link.** Never a bare `underline` or a
 * `hover:underline`: those are a different affordance drawn by hand, and two of them in one
 * paragraph is two things that look like links and behave differently. See the Hyperlinks rule
 * in `frontend-architecture.md`.
 *
 * `soft` keeps the link in the inherited text color at rest and only fades to the link blue on
 * hover/focus — at which point it looks identical to the default variant (blue text + the same
 * underline wipe). That is the variant for a link inside prose or a byline, where a permanently
 * blue word would pull the eye off the sentence it belongs to.
 *
 * `href` is optional: with no href it renders a non-navigating span, so it can wrap the label of
 * a button that opens something rather than navigating.
 *
 * **Built from spans, not divs, so it is valid anywhere phrasing content is** — including inside
 * a `<p>`, which is where most of the app's links actually sit. The flex container blockifies
 * them, so the wipe still positions and clips exactly as a block would.
 *
 * The hover group is **named** (`group/link`): a bare `group-hover:` matches *any* ancestor
 * carrying `group`, so a link inside a row that reveals a control on hover would underline
 * itself from anywhere in that row rather than from the word.
 *
 * `truncate` is for a label in a row that can run out of room — a byline beside a timestamp. The
 * default sizes both boxes to their content (`w-fit`), which pushes a long name past the card
 * rather than ellipsing it; this swaps that for `min-w-0 max-w-full` so the chain can shrink, and
 * puts the ellipsis on the inner box. The wipe stays `w-full`, so it spans exactly what is
 * visible. **The caller has to allow the shrink too** — a flex item needs its own `min-w-0` or it
 * refuses to go below its content width and nothing here can help. */
const Hyperlink = ({ children, className, soft, truncate, href, ...props }) => {
    const Comp = href ? NextLink : "span"

    return (
        <Comp
            className={cn(
                "group/link text-inherit inline-flex cursor-pointer",
                truncate ? "min-w-0 max-w-full" : "w-fit",
                className,
            )}
            {...(href ? { href } : {})}
            {...props}
        >
            <span
                className={cn(
                    "overflow-hidden relative pb-1.5 -mb-1.5 leading-[0.8em]",
                    truncate ? "min-w-0 max-w-full truncate" : "w-fit",
                    soft
                        ? "text-inherit transition-colors group-hover/link:text-link group-focus-visible/link:text-link"
                        : "text-link",
                )}
            >
                {children}
                <span className="absolute bottom-0 left-0 h-[1.5px] w-full scale-x-0 origin-right group-hover/link:scale-x-100 group-hover/link:origin-left bg-current rounded-full transition-transform duration-200" />
            </span>
        </Comp>
    )
}

export default Hyperlink
