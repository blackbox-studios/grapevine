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

/* Columns for the User Management table skeleton. Mirrors the shape used on
 * the settings user-management page: Name (avatar + stacked name/email), Role
 * (badge), Status (dot + label), Joined date. */
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
        headClassName: "w-28",
        head: <Skeleton className="h-4 w-12" />,
        cell: <Skeleton className="h-6 w-16 rounded-full" />,
    },
    {
        headClassName: "w-32 text-center",
        head: <Skeleton className="mx-auto h-4 w-14" />,
        cellClassName: "text-center",
        cell: <Skeleton className="mx-auto size-6 rounded-full" />,
    },
    {
        headClassName: "w-32",
        head: <Skeleton className="h-4 w-16" />,
        cell: <Skeleton className="h-4 w-24" />,
    },
    {
        headClassName: "w-32",
        head: <Skeleton className="h-4 w-20" />,
        cell: <Skeleton className="h-4 w-24" />,
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
                    <Skeleton className="aspect-4/5 w-full rounded-lg" />
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

export default Skeleton
