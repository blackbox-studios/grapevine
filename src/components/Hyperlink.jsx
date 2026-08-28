// Animation for hovering over something that looks like a hyperlink

import NextLink from "next/link"

import { cn } from "@/lib/utils"

/* `soft` keeps the link in the inherited text color at rest and only fades to
 * the link blue on hover/focus — at which point it looks identical to the
 * default variant (blue text + the same underline wipe). Useful where a link
 * sits next to a louder primary action and shouldn't compete for attention.
 *
 * `href` is optional: with no href it renders a non-navigating span so it can be
 * used purely as decorative link-styled text.
 *
 * **It cannot sit inside a `<p>`.** The underline wipe is built from `<div>`s, and a `<div>`
 * inside a `<p>` is invalid HTML — React reports it as a hydration error and the browser
 * silently closes the paragraph early. Prose that embeds one has to be a flow container
 * (`<div>`), not a paragraph. */
const Hyperlink = ({ children, className, soft, href, ...props }) => {
    const Comp = href ? NextLink : "span"

    return (
        <Comp className={cn("group text-inherit w-fit inline-flex cursor-pointer", className)} {...(href ? { href } : {})} {...props}>
            <div
                className={cn(
                    "overflow-hidden relative w-fit pb-1.5 -mb-1.5",
                    soft
                        ? "text-inherit transition-colors group-hover:text-link group-focus-visible:text-link"
                        : "text-link",
                )}
            >
                {children}
                <div className="absolute left-0 h-[1.5px] w-full scale-x-0 origin-right group-hover:scale-x-100 group-hover:origin-left bg-current rounded-full mt-1 transition-transform duration-200" />
            </div>
        </Comp>
    )
}

export default Hyperlink
