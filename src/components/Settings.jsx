"use client"

import Link from "next/link"

import Icon from "@/components/Icon"
import { cn } from "@/lib/utils"

/* One destination in a settings list: an icon, a label, and a chevron — a shape that reads as
 * "this goes somewhere", which a bare text row does not.
 *
 * **Shared because there are two settings trees and they are deliberately the same shape.**
 * `/settings` asks about the person and `/group` asks about the parish; a reader who has used
 * one already knows how to read the other, and that only stays true while both are drawn by
 * this. Restyle a row here and both follow.
 *
 * `onClick` rather than `href` is what lets logging out share it: signing out is not a place,
 * but it belongs in the list because it is one of the things a person comes here to do, and a
 * button that looked different from its neighbours would only draw attention to an
 * implementation detail. */
export const SettingsRow = ({ icon: RowIcon, label, href, onClick, destructive = false }) => {
    const body = (
        <>
            {/* The bare icon — no disc, no ring. The span stays only to carry the row's tone:
                `icon` is a drawn SVG whose paths are all currentColor, so it inherits red on
                the destructive row the same way the chevron below does.

                Unlike that chevron, these are not Material Symbols ligature names. They are
                bespoke files that ship at their natural 24px, and every row uses that one size,
                which is what keeps the labels aligned without a fixed-width slot. */}
            <span
                className={cn(
                    "flex shrink-0 items-center justify-center",
                    destructive ? "text-destructive" : "text-foreground",
                )}
            >
                <RowIcon className="size-6 shrink-0" />
            </span>
            <span
                className={cn("flex-1 text-base font-medium", destructive && "text-destructive")}
            >
                {label}
            </span>
            {/* The chevron takes the row's tone too. Leaving it muted on the destructive row
                left one grey element in a line that is otherwise entirely red, which reads as
                the arrow belonging to something else. */}
            <Icon
                size="xl"
                className={destructive ? "text-destructive" : "text-muted-foreground"}
            >
                chevron_right
            </Icon>
        </>
    )

    const className =
        "flex w-full cursor-pointer items-center gap-5 rounded-full px-4 py-3 text-left transition-colors hover:bg-accent"

    if (href) {
        return (
            <Link href={href} scroll={false} className={className}>
                {body}
            </Link>
        )
    }

    return (
        <button type="button" onClick={onClick} className={className}>
            {body}
        </button>
    )
}
