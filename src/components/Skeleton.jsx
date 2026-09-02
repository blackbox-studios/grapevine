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
            /* `gap-4`, matching the real Name cell. At `gap-3` every name and email in the
             * table stepped 4px right as the rows landed. */
            <div className="flex items-center gap-4">
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
            {/* `min-w-0`, matching the surface the real table sits in — the Table primitive
               brings its own `overflow-x-auto`, and clipping here instead would make the
               skeleton the one thing on the page that cannot be scrolled sideways. */}
            <div className="min-w-0">
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

/* Skeleton for the comments surface (see components/Comments.jsx): a stack of comment rows —
 * avatar, a short meta line and a body line, plus the like column (heart + count) on the
 * right.
 *
 * Geometry tracks <CommentRow/>'s: the same `px-4 py-2.5` box, a `size-9` avatar, `gap-1`
 * between the meta and body lines, and a like column at `pt-1.5` around a `size-3.5` heart.
 * Those four had drifted a pixel or two each, which is enough to make the whole column step
 * sideways when the thread arrives. */
export function CommentsSkeleton({ count = 8 }) {
    return (
        <div className="flex flex-col">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <Skeleton className="size-9 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3.5 w-4/5" />
                    </div>
                    <div className="flex items-start gap-2.5 pt-1.5">
                        <div className="flex flex-col items-center gap-1">
                            <Skeleton className="size-3.5 rounded-full" />
                            <Skeleton className="h-2.5 w-3" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

/* The tab bar's box, for a surface whose skeleton has to stand in for one.
 *
 * **It cannot borrow `<TabsList/>`**: that reads its height from a `group-data-horizontal/tabs`
 * variant, which only resolves inside a mounted `<Tabs/>` — so a placeholder rendered outside
 * one collapses to nothing. The height is therefore restated here, and it is the one number
 * that has to stay in step with the real bar; everything else about it is a grey pill.
 *
 * `bg-muted/50` rather than the primitive's `bg-muted`, matching the bar it stands in for, which
 * is a track rather than a solid block. */
export function TabsSkeleton({ className }) {
    return <Skeleton className={cn("h-9 w-full rounded-full bg-muted/50", className)} />
}

/* Skeleton for a list of people — a follow list, and anything else that draws <PersonRow/>.
 *
 * The two text lines are the name over the handle, and the block on the right stands in for the
 * follow button, which most rows carry: leaving it out shrinks the row's text column between
 * the skeleton and the list, so the names visibly shift left as it resolves. */
export function PeopleSkeleton({ count = 8 }) {
    return (
        <div className="flex flex-col">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2">
                    <Skeleton className="size-11 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-8 w-24 shrink-0 rounded-full" />
                </div>
            ))}
        </div>
    )
}

/* The geometry of one notification row — the box, not the look.
 *
 * **Exported so <NotificationRow/> and the skeleton below are the same string rather than two
 * copies of it.** Every value here moves the layout: the padding decides where the avatar
 * starts and where the timestamp ends, and the vertical padding sets the row height, which
 * compounds down a list. Hand-syncing them is what put the skeleton 12px to the left of the
 * rows it stood in for and made every row 4px too tall, so the whole panel stepped as it
 * loaded. Restyle the row by editing this, and the skeleton follows.
 *
 * The row adds its own interaction and colour on top (`w-full`, cursor, hover, the unread
 * tint), and its own radius, which varies with the rows either side and so cannot be a
 * constant; none of that changes the box, so none of it belongs here. */
export const NOTIFICATION_ROW = "flex items-start gap-3 py-2 pl-5 pr-6.5"

/* Skeleton for the notifications panel (see components/Notifications.jsx): a stack of rows,
 * each an avatar, the actor's name and what they did, and the relative time on the right.
 *
 * The nesting mirrors <NotificationRow/>'s, including the inner flex the text column and the
 * timestamp share — flattening it put the time bar one gap further right than the real one.
 * The bar offsets are chosen so each sits on the centre line of the text it stands for: the
 * name is a `leading-tight` 14px line (17.5px tall), the body a default `text-sm` line (20px),
 * and the timestamp a `text-xs` line already pushed down by `pt-0.5`. */
export function NotificationsSkeleton({ count = 6 }) {
    return (
        <div className="flex flex-col gap-1">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className={NOTIFICATION_ROW}>
                    <Skeleton className="size-10 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <Skeleton className="mt-0.5 h-3.5 w-28" />
                            <Skeleton className="mt-2 h-3 w-36" />
                        </div>
                        <Skeleton className="mt-1 h-3 w-6 shrink-0" />
                    </div>
                </div>
            ))}
        </div>
    )
}

export default Skeleton
