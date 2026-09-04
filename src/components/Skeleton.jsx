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
 * starts and where the action ends, and the vertical padding sets the row height, which
 * compounds down a list. Hand-syncing them is what put the skeleton 12px to the left of the
 * rows it stood in for and made every row 4px too tall, so the whole panel stepped as it
 * loaded. Restyle the row by editing this, and the skeleton follows.
 *
 * `items-center` because the row's sentence wraps: the avatar and the action stand against a
 * text column one or two lines tall, and aligning them to its top leaves both hanging.
 *
 * The row adds its own colour on top — the hover and the unread tint — and its own radius,
 * which varies with the rows either side and so cannot be a constant; neither changes the box,
 * so neither belongs here. */
export const NOTIFICATION_ROW = "flex items-center gap-3 py-2 pl-5 pr-6.5"

/* Skeleton for the notifications panel (see components/Notifications.jsx): a stack of rows,
 * each an avatar beside the two lines the real row's sentence wraps to.
 *
 * Two bars of unequal length rather than one per field: the row is a single wrapping paragraph
 * — handle, what they did, and the time all in one — so what a reader sees loading is a block
 * of text that runs out partway, not a name over a subtitle. The row's own `items-center` is
 * what stands them beside the avatar, so neither bar carries an offset of its own. */
export function NotificationsSkeleton({ count = 6 }) {
    return (
        <div className="flex flex-col gap-1">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className={NOTIFICATION_ROW}>
                    <Skeleton className="size-10 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="mt-2 h-3.5 w-24" />
                    </div>
                </div>
            ))}
        </div>
    )
}

/* The Events surface's month grid, painted on the first frame.
 *
 * It reproduces the **shape** of the month and nothing under it, because there is nothing under
 * it: the day is a separate surface, reached by tapping a square. A skeleton that drew a panel
 * the real screen does not have would collapse by that much at the moment the content arrives,
 * which is precisely the moment a skeleton exists to smooth.
 *
 * Six rows for the same reason the real grid is fixed at six: a February that fitted in five
 * would make the legend under it jump.
 *
 * Only ever seen once. Months are cached and their neighbours prefetched, so paging is a
 * lookup — this is the cold open of the tab and nothing else. */
export function CalendarSkeleton() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-44" />
                <Skeleton className="h-8 w-20 rounded-full" />
            </div>

            <div>
                <div className="grid grid-cols-7">
                    {Array.from({ length: 7 }).map((_, index) => (
                        <div key={index} className="flex justify-center pb-2">
                            <Skeleton className="h-2.5 w-2.5" />
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                    {Array.from({ length: 42 }).map((_, index) => (
                        <div key={index} className="grid aspect-square place-items-center">
                            <Skeleton className="size-9 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-center gap-5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-16" />
            </div>
        </div>
    )
}

/* The sign-ups tab: the rotas as collapsed rows. Each row is one line, because that is what a
 * collapsed accordion is. */
export function SignupsSkeleton({ count = 3 }) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                {Array.from({ length: count }).map((_, index) => (
                    <div
                        key={index}
                        className="flex items-center gap-4 rounded-3xl border px-5 py-4"
                    >
                        <div className="flex flex-1 flex-col gap-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-32" />
                        </div>
                        <Skeleton className="size-6 rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    )
}

/* One rota, arriving. The shape of `<RotaPage/>` and not of the list it is usually reached
 * from: a back arrow and a title, a line or two of instructions, then dates.
 *
 * It exists because the two are only both plausible on one path — a link opened cold, with no
 * list behind it to promote a copy from. Everywhere else the rota paints on the frame the tap
 * happened, so this is the arrival that has nothing to show and the one that must not show the
 * wrong thing: a list skeleton resolving into a rota is a screen visibly changing its mind. */
export function RotaSkeleton({ count = 4 }) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <Skeleton className="h-5 w-48" />
            </div>

            <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
            </div>

            <div className="flex flex-col divide-y">
                {Array.from({ length: count }).map((_, index) => (
                    <div key={index} className="flex items-center gap-4 px-2 py-6">
                        <div className="flex flex-1 flex-col gap-2">
                            <Skeleton className="h-4 w-44" />
                            <Skeleton className="h-3 w-32" />
                        </div>
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-8 w-16 rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    )
}

export default Skeleton
