"use client"

import { useRouter } from "next/navigation"

import Icon from "@/components/Icon"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/* The bar every drill-down wears on a phone: an arrow back to where you came from, and the
 * name of where you are. Only drill-downs get one — anything the bottom rail reaches is not
 * somewhere you went *into*, so an arrow there points at nothing in particular.
 *
 * `back` is either a function — a slide route's `useSlideDismiss()`, which keeps the arrow,
 * Escape and the hardware back gesture one action — or the path of the parent a page was
 * drilled into from. A path is pushed rather than unwound with `history.back()`, because a cold
 * load (a shared link, a reload) has no entry to unwind and would leave the app entirely.
 *
 * `tone="overlay"` turns the bar white with a drop shadow, for the post slide, where it lies
 * over the photo rather than over a background.
 *
 * `bleed` is what a page passes, and the hiding and the offsets are one decision rather than
 * two: a page renders inside the shell's mobile gutter (`px-4`) and top run-in (`pt-4`), which
 * a slide route's full-screen surface does not have, and those offsets are measured against the
 * *mobile* gutter — so a bar left visible at md would under-cancel the `px-8`/`px-18` one. A
 * slide route passes nothing, being already chosen by `isDesktop` in JS.
 *
 * `children` is optional and renders below the bar, so a page can be wrapped rather than have
 * the bar threaded into its own markup. */
export const BackHeader = ({
    title,
    back,
    action,
    tone = "default",
    bleed = false,
    className,
    children,
}) => {
    const router = useRouter()
    const overlay = tone === "overlay"

    const goBack =
        typeof back === "function"
            ? back
            : () => router.push(back, { scroll: false })

    const header = (
        <header
            className={cn(
                "flex shrink-0 items-center gap-4 px-2 py-4",
                bleed && "-mx-4 -mt-4 md:hidden",
                overlay && "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]",
                className,
            )}
        >
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={goBack}
                aria-label="Go back"
                className={cn(overlay && "text-white hover:bg-white/10 hover:text-white")}
            >
                <Icon size="xl">arrow_back</Icon>
            </Button>

            {/* One line: a long group name shortens rather than pushing the action slot off
                the right edge. */}
            {title && (
                <h2 className="min-w-0 truncate text-xl font-medium tracking-tight">
                    {title}
                </h2>
            )}

            {action && <div className="ml-auto flex items-center">{action}</div>}
        </header>
    )

    if (!children) return header

    return (
        <>
            {header}
            {children}
        </>
    )
}

export default BackHeader
