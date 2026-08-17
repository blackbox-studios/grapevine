"use client"

import { useState } from "react"
import { AnimatePresence } from "motion/react"

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
import Transition from "@/components/Transition"
import { USER_TABLE_COLUMNS, TableSkeleton } from "@/components/Skeleton"
import { Avatar } from "@/components/Widgets"
import { MEMBERSHIP_STATUS, ROLES, VOCATIONS } from "@/lib/constants"
import { formatDate, roleLabel } from "@/lib/utils"
import { useMembers } from "@/lib/store/members/hook"

/* The group roster — every member of the parish, with the two things that describe them.
 *
 * The columns are the domain model made visible, so it is worth naming what they are:
 *
 *   Role      ADMIN | MEMBER — what the person may DO. Only an admin can publish.
 *   Vocation  PRIEST | FAITHFUL — who the person IS. Grants nothing.
 *   Status    the approval gate. Only APPROVED puts this group's posts in their feed.
 *
 * Admin-only, enforced on the server: a non-admin who reaches this URL gets a 403, which
 * the store resolves to an empty table rather than a toast. */

/* PENDING is the row an admin is here to act on, so it reads as an alert; a revoked or
 * rejected membership is a closed door, not a warning. */
const STATUS_VARIANT = {
    [MEMBERSHIP_STATUS.APPROVED]: "success",
    [MEMBERSHIP_STATUS.PENDING]: "warning",
    [MEMBERSHIP_STATUS.REJECTED]: "destructive",
    [MEMBERSHIP_STATUS.REVOKED]: "destructive",
}

const SettingsUsersPage = () => {
    const { members, group, skeleton: loading } = useMembers()

    const [pageSize, setPageSize] = useState(5)
    const [page, setPage] = useState(1)

    const total = members.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(page, totalPages)
    const pageRows = members.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
                <h2 className="text-xl font-semibold text-foreground">
                    <span className="text-muted-foreground">({total ?? 0})</span>{" "}
                    {group?.name ?? "Members"}
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
                                        <TableHead className="w-32">Vocation</TableHead>
                                        <TableHead className="w-32">Status</TableHead>
                                        <TableHead className="w-32">Joined</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pageRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={5}
                                                className="h-24 text-center text-muted-foreground"
                                            >
                                                No members found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        pageRows.map((member) => (
                                            <TableRow key={member.id} className="*:py-5">
                                                <TableCell>
                                                    <div className="flex items-center gap-4">
                                                        <Avatar
                                                            name={member.fullName}
                                                            src={member.avatar}
                                                            className="size-9 shrink-0"
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-foreground">
                                                                {member.fullName}
                                                            </span>
                                                            <span className="text-sm text-muted-foreground">
                                                                {member.email}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={
                                                            member.role === ROLES.ADMIN
                                                                ? "info"
                                                                : undefined
                                                        }
                                                    >
                                                        {roleLabel(member.role)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <span
                                                        className={
                                                            member.vocation === VOCATIONS.PRIEST
                                                                ? "text-foreground"
                                                                : "text-muted-foreground"
                                                        }
                                                    >
                                                        {roleLabel(member.vocation)}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={STATUS_VARIANT[member.status]}>
                                                        {roleLabel(member.status)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {formatDate(member.requestedAt)}
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
