"use client"

import { useState } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import Pagination from "@/components/Pagination"
import Badge from "@/components/Badge"
import { YayOrNay } from "@/components/Widgets"
import { formatDate, gradientFor, roleLabel, timeAgo } from "@/lib/utils"
import { useNow } from "@/lib/hooks/useNow.hook"
import { useAdmin } from "@/lib/store/auth/hook"
import { USER_TABLE_COLUMNS, TableSkeleton } from "@/components/Skeleton"
import { AnimatePresence } from "motion/react"
import Transition from "@/components/Transition"


const SettingsUsersPage = () => {
    const { users, skeleton: loading } = useAdmin()

    const [pageSize, setPageSize] = useState(5)
    const [page, setPage] = useState(1)
    const now = useNow()

    const total = users.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(page, totalPages)
    const pageRows = users.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
                <h2 className="text-xl font-semibold text-foreground">
                    <span className="text-muted-foreground">({total ?? 0})</span> All Users
                </h2>
            </div>

            <div className="overflow-hidden pt-6 pb-2">
                <AnimatePresence mode="wait" initial={false}>
                    {loading ? (
                        <Transition fast key="skeleton">
                            <TableSkeleton columns={USER_TABLE_COLUMNS} rowClassName="*:py-5" />
                        </Transition>
                    ) : (
                        <Transition fast key="content">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead className="w-28">Role</TableHead>
                                        <TableHead className="w-32 text-center">Is Enabled</TableHead>
                                        <TableHead className="w-32">Joined</TableHead>
                                        <TableHead className="w-32">Last Login</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pageRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={5}
                                                className="h-24 text-center text-muted-foreground"
                                            >
                                                No users found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        pageRows.map((user) => (
                                            <TableRow key={user.id} className="*:py-5">
                                                <TableCell>
                                                    <div className="flex items-center gap-4">
                                                        <span
                                                            aria-hidden="true"
                                                            style={gradientFor(user.id)}
                                                            className="size-9 shrink-0 rounded-full shadow-sm opacity-75"
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-foreground">
                                                                {user.full_name}
                                                            </span>
                                                            <span className="text-sm text-muted-foreground">
                                                                {user.email}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge>
                                                        {roleLabel(user.role)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <YayOrNay value={user.is_enabled} />
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {formatDate(user.created_at)}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {user.last_login
                                                        ? timeAgo(now, new Date(user.last_login).getTime())
                                                        : "Never"}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>

                            <Pagination
                                page={currentPage}
                                pageSize={pageSize}
                                total={total}
                                setPage={setPage}
                                setPageSize={setPageSize}
                            />
                        </Transition>
                    )}
                </AnimatePresence>
            </div>
        </section>
    )
}

export default SettingsUsersPage
