"use client"

import { useState } from "react"

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useHasHover } from "@/lib/hooks/useHasHover.hook"
import { cn } from "@/lib/utils"

/* A sentence revealed over whatever it wraps — the app's whole answer to "what is this?".
 *
 * One surface for both pointers, rather than a tooltip on desktop and a popover on touch: two
 * primitives meant two sets of type and colour for one sentence, and a Radix tooltip cannot be
 * opened by a finger at all. It answers the first tap with a hover it then has to dismiss, so
 * touch has to tap twice; that is why there is no tooltip in this app.
 *
 * What differs by pointer is only what *opens* it. A mouse gets hover, so a hovering pointer
 * anchors the surface without a trigger at all — `PopoverAnchor` positions but binds no click,
 * which is what keeps a click from toggling shut something the pointer is still resting on.
 * Touch has no hover, so it gets the real trigger and opens on a tap.
 *
 * Hover and focus travel together on the anchor branch, and *only* there. An anchor binds
 * nothing of its own, so it needs both to open at all. The trigger already opens on tap and on
 * Enter — adding focus to it means a tap opens on focus and then the trigger's own toggle
 * closes it again in the same gesture, which reads as a flash and leaves the second tap to do
 * the opening.
 *
 * `onOpenAutoFocus` is prevented because a popover ordinarily takes focus when it opens, and a
 * surface that appears on hover must not pull the caret out of whatever the reader was doing.
 * Nothing inside is interactive, so there is nothing in there to focus anyway.
 *
 * `children` is the thing being explained and must accept a ref, since both branches render it
 * `asChild`. Whatever it is carries the accessible name — the hint is a second reading of
 * something the trigger already says, so it is not one a screen reader has to reach. */
const Hint = ({ content, side = "bottom", align = "center", className, children }) => {
    const hasHover = useHasHover()
    const [open, setOpen] = useState(false)

    const Trigger = hasHover ? PopoverAnchor : PopoverTrigger
    const reveal = hasHover
        ? {
            onMouseEnter: () => setOpen(true),
            onMouseLeave: () => setOpen(false),
            onFocus: () => setOpen(true),
            onBlur: () => setOpen(false),
        }
        : {}

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <Trigger asChild {...reveal}>
                {children}
            </Trigger>
            <PopoverContent
                side={side}
                align={align}
                onOpenAutoFocus={(event) => event.preventDefault()}
                className={cn("w-auto max-w-64 rounded-2xl p-3 text-center text-sm", className)}
            >
                {content}
            </PopoverContent>
        </Popover>
    )
}

export default Hint
