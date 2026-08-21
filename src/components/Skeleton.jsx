/* Ensure this is updated each time a table is modified */

/* The *_TABLE_COLUMNS exports below are shared table-shape data (arrays of
 * <Skeleton/> cells) intentionally colocated with the skeleton primitives they
 * are built from. */

import { cn } from "@/lib/utils"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

function Skeleton({ className, ...props }) {
    return (
        <div
            className={cn("animate-pulse rounded-md bg-muted", className)}
            aria-hidden="true"
            {...props}
        />
    )
}

/* Columns for the User Management table skeleton — one entry per column of the roster on
 * the settings user-management page, in its order and at its widths: Name (avatar +
 * stacked name/email), Vocation and Role (both inline pickers), Access (a check or an X),
 * Activity, and the row's action button. Widths that disagree with the real table are what
 * makes the columns jump as the rows land, so change these together. */
export const USER_TABLE_COLUMNS = [
    {
        head: <Skeleton className="h-4 w-12" />,
        cell: (
            <div className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56 max-w-full" />
                </div>
            </div>
        ),
    },
    {
        headClassName: "w-44",
        head: <Skeleton className="h-4 w-16" />,
        cell: <Skeleton className="h-11 w-40 rounded-lg" />,
    },
    {
        headClassName: "w-40",
        head: <Skeleton className="h-4 w-10" />,
        cell: <Skeleton className="h-11 w-36 rounded-lg" />,
    },
    {
        headClassName: "w-28 text-center",
        head: <Skeleton className="mx-auto h-4 w-14" />,
        cellClassName: "text-center",
        cell: <Skeleton className="mx-auto size-6 rounded-full" />,
    },
    {
        headClassName: "w-40",
        head: <Skeleton className="h-4 w-16" />,
        cell: <Skeleton className="h-4 w-24" />,
    },
    {
        headClassName: "w-28 text-right",
        head: <Skeleton className="ml-auto h-4 w-14" />,
        cellClassName: "text-right",
        cell: <Skeleton className="ml-auto h-11 w-24 rounded-lg" />,
    },
]

export function TableSkeleton({
    rows = 5,
    columns = USER_TABLE_COLUMNS,
    rowClassName = "*:py-4.5",
    className,
}) {
    return (
        <div className={cn("flex flex-col gap-6", className)}>
            <div className="overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((column, i) => (
                                <TableHead
                                    key={i}
                                    className={column.headClassName}
                                >
                                    {column.head}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: rows }, (_, i) => (
                            <TableRow className={rowClassName} key={i}>
                                {columns.map((column, j) => (
                                    <TableCell
                                        key={j}
                                        className={column.cellClassName}
                                    >
                                        {column.cell}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}

/* Skeleton for the Instagram-style home feed (see components/Feed.jsx): stacked
 * post cards, each an avatar + name lines, a tall media block, an action row, and
 * a couple of caption lines. */
export function FeedSkeleton({ count = 3 }) {
    return (
        <div className="flex flex-col gap-8">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <Skeleton className="size-9 shrink-0 rounded-full" />
                        <div className="flex flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-36" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                    {/* Full-bleed on mobile to match the feed's edge-to-edge media (see
                     * Feed.jsx's `-mx-4` breakout); a rounded card from md. */}
                    <Skeleton className="-mx-4 aspect-4/5 rounded-none md:mx-0 md:rounded-lg" />
                    <div className="flex items-center gap-4 pt-1">
                        <Skeleton className="size-6 rounded-full" />
                        <Skeleton className="size-6 rounded-full" />
                    </div>
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-2/3" />
                </div>
            ))}
        </div>
    )
}

/* Skeleton for a single post's media block (see components/PostView.jsx).
 *
 * This only ever shows on a **cold load** of `/p/:id` — a shared link or a refresh, where
 * there is no feed behind the surface to borrow the already-decoded photo from. Opened from
 * inside the app the post paints whole on the first frame instead (see post/store.js →
 * load), so reaching this branch in normal use means that cache path broke. */
export function PostMediaSkeleton({ desktop = false }) {
    return (
        <Skeleton
            className={cn(
                "w-full",
                desktop ? "h-[90dvh] w-[min(70vw,40rem)] rounded-none" : "aspect-square rounded-none",
            )}
        />
    )
}

/* Skeleton for the comments surface (see components/Comments.jsx): a stack of
 * comment rows — avatar, a short meta line and a body line, plus the like column
 * (heart + count) on the right. */
export function CommentsSkeleton({ count = 8 }) {
    return (
        <div className="flex flex-col">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <Skeleton className="size-9 shrink-0 rounded-full" />
                    <div className="flex flex-1 flex-col gap-2 pt-1">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-4/5" />
                    </div>
                    <div className="flex flex-col items-center gap-1.5 pt-1">
                        <Skeleton className="size-4 rounded-full" />
                        <Skeleton className="h-2.5 w-4" />
                    </div>
                </div>
            ))}
        </div>
    )
}

export default Skeleton
