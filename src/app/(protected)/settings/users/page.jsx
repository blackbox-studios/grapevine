"use client"

import { useCallback, useMemo, useState } from "react"
import { AnimatePresence } from "motion/react"
import { toast } from "sonner"

import Ripple from "@/assets/svg/ripple.svg"
import { PrivilegedRoute } from "@/components/Auth"
import Badge from "@/components/Badge"
import Icon from "@/components/Icon"
import { KeyboardAwareColumn } from "@/components/KeyboardAware"
import Pagination from "@/components/Pagination"
import Transition from "@/components/Transition"
import { USER_TABLE_COLUMNS, TableSkeleton } from "@/components/Skeleton"
import { Avatar, YayOrNay } from "@/components/Widgets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    MEMBERSHIP_STATUS,
    ROLES,
    VOCATION_OPTIONS,
    VOCATIONS,
} from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { useNow } from "@/lib/hooks/useNow.hook"
import { useMembers } from "@/lib/store/members/hook"
import { cn, roleLabel, timeAgo } from "@/lib/utils"

/* The parish roster — and the only way into the parish.
 *
 * Admission is the whole security model: sign-in uses `shouldCreateUser: false`, so an
 * address with no account can never obtain a code. Adding someone here *is* whitelisting
 * them, and there is no self-serve path that bypasses it.
 *
 * That last point is why there is no "approve" action, and no approval queue. Admission
 * writes an APPROVED membership on the spot (see `admitOne`) and nobody can ask to join,
 * so the only status change this table performs is removing someone, or letting a removed
 * member back in. See the admission note in schema.prisma's header.
 *
 * The table answers three questions an admin actually has: who has never turned up, who is
 * still mid-orientation, and who is who. The last is why vocation is editable inline — a
 * priest sets it when admitting someone and adjusts it as people are tonsured or ordained;
 * the first two are what the Activity column is for. */

const STATUS_VARIANT = {
    [MEMBERSHIP_STATUS.APPROVED]: "success",
    [MEMBERSHIP_STATUS.REVOKED]: "destructive",
}

const ROLE_OPTIONS = [ROLES.MEMBER, ROLES.ADMIN]

/* Name, email and handle together, because an admin searching a roster has one of the
 * three in mind and does not think about which. Matched as one string so "fr alex" finds
 * "Fr. Alexander" without needing every field checked separately. */
const matchesQuery = (member, query) => {
    if (!query) return true
    return `${member.fullName} ${member.email} ${member.handle}`.toLowerCase().includes(query)
}

/* Whether an invitation has been taken up, and how far.
 *
 * Three states, not two, because they are genuinely different to an admin: someone who has
 * never signed in may not know they were added, whereas someone stuck in orientation
 * clearly does. Collapsing them into "inactive" loses the distinction that decides which
 * of the two you go and talk to. */
const activityOf = (member, now) => {
    if (!member.lastSeenAt) {
        return { label: "Not yet signed in", muted: true }
    }
    if (!member.onboardedAt) {
        return { label: "Orientation pending", muted: true }
    }
    return { label: timeAgo(now, new Date(member.lastSeenAt).getTime()), muted: false }
}

/* A one-of-many picker built on the shadcn dropdown menu rather than the Select.
 *
 * Both render a list and set a value, but only this one composes with the surfaces it has
 * to live inside: Radix Select traps its own scroll and pointer handling, which fights a
 * Vaul drawer's drag on a phone and turns the vocation picker in the admissions sheet into
 * a control you can open but not choose from. The menu portals cleanly out of both. */
const Picker = ({ value, options, onChange, disabled, label, className }) => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
            <Button
                type="button"
                variant="outline"
                aria-label={label}
                className={cn("h-11 justify-between px-4 font-normal", className)}
            >
                {roleLabel(value)}
                <Icon size="md" className="text-muted-foreground">
                    expand_more
                </Icon>
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
                {options.map((option) => (
                    <DropdownMenuRadioItem key={option} value={option}>
                        {roleLabel(option)}
                    </DropdownMenuRadioItem>
                ))}
            </DropdownMenuRadioGroup>
        </DropdownMenuContent>
    </DropdownMenu>
)

/* Admissions. Emails go over as one blob — the server splits on commas, semicolons and
 * whitespace — because that is how a list of parishioners actually arrives: pasted out of
 * a spreadsheet or an email, not typed one at a time. */
const InviteForm = ({ group, invite, inviting, onDone }) => {
    const [emails, setEmails] = useState("")
    const [role, setRole] = useState(ROLES.MEMBER)
    const [vocation, setVocation] = useState(VOCATIONS.FAITHFUL)
    const [failed, setFailed] = useState([])

    /* One gate for the button and the handler, so the two cannot drift. */
    const disabled = useMemo(() => inviting || emails.trim().length === 0, [inviting, emails])

    /* Success leaves, failure stays.
     *
     * The two halves of the report want opposite things. "Added three people" is a fact
     * about a job that is over — the roster behind has already refreshed and shows them —
     * so it belongs in a toast and the sheet should get out of the way. A rejected address
     * is the opposite: it is unfinished work, and the textarea holding it is the only copy
     * the admin has, so closing over it would throw away the thing they need to fix. */
    const handleInvite = async () => {
        if (disabled) return
        setFailed([])

        const result = await invite({ emails, role, vocation })
        if (!result) return

        const added = result.admitted.length
        if (added > 0) {
            toast.success(
                `Added ${added} ${added === 1 ? "person" : "people"} to ${group?.name ?? "the parish"}.`,
            )
        }

        if (result.failed.length === 0) {
            setEmails("")
            onDone?.()
            return
        }

        /* Leaving the bad addresses in place means the admin can fix a typo rather than
         * retype the whole list. */
        setFailed(result.failed)
        setEmails(result.failed.map((entry) => entry.email).join("\n"))
    }

    return (
        <div className="flex flex-col gap-4">
            {/* `field-sizing-content` on the shadcn Textarea means it grows with a pasted
              * list instead of trapping thirty addresses behind a scrollbar. `rows` sets the
              * floor, not the ceiling. */}
            <Textarea
                value={emails}
                onChange={(event) => setEmails(event.target.value)}
                disabled={inviting}
                rows={3}
                aria-label="Email addresses"
                placeholder={"one@parish.org, two@parish.org\nor one per line"}
                className="rounded-2xl border-transparent bg-muted px-4 py-3 dark:bg-input/30"
            />

            <div className="flex flex-wrap items-center gap-3">
                <Picker
                    value={vocation}
                    options={VOCATION_OPTIONS}
                    onChange={setVocation}
                    disabled={inviting}
                    label="Vocation"
                    className="w-44"
                />
                <Picker
                    value={role}
                    options={ROLE_OPTIONS}
                    onChange={setRole}
                    disabled={inviting}
                    label="Role"
                    className="w-36"
                />

                {/* The label keeps its place in the layout while the request is in flight,
                  * and the spinner is laid over it, so the button is exactly the same width
                  * busy as idle. Swapping the text out for the spinner shrinks it by about
                  * a third, and in a wrapping row that is enough to let the button fit on
                  * the line above — so it jumps up the instant it is clicked, which reads
                  * as the whole sheet resizing under the cursor. */}
                <Button
                    type="button"
                    onClick={handleInvite}
                    disabled={disabled}
                    className="relative ml-auto h-11 px-8"
                >
                    <span className={cn(inviting && "invisible")}>Add to parish</span>
                    {inviting && (
                        <Ripple
                            aria-label="Adding people"
                            className="absolute inset-0 m-auto size-5 [&_circle]:stroke-current"
                        />
                    )}
                </Button>
            </div>

            {/* Only the failures render here. The success line moved to a toast, because by
              * the time it would appear the sheet has closed. */}
            {failed.length > 0 && (
                <div className="flex flex-col gap-1 text-sm">
                    {failed.map((entry) => (
                        <p key={entry.email} className="text-destructive">
                            {entry.email} — {entry.reason}
                        </p>
                    ))}
                </div>
            )}
        </div>
    )
}

/* The admissions form as an overlay: a centred dialog on a desktop, a bottom drawer on a
 * phone. Same swap, and the same reasoning, as the post view — a form that is occasional
 * rather than constant should not sit permanently above the roster the admin came to read.
 *
 * It closes itself on a clean run and stays open when anything failed — see the note on
 * `handleInvite`. Closing is `onDone`, passed down rather than decided in the form, because
 * the form does not know which of the two surfaces it is currently inside. */
const Admissions = ({ group, invite, inviting }) => {
    const [open, setOpen] = useState(false)
    const isDesktop = useIsDesktop()

    /* Open/closed React state, not a URL, so Android's back gesture has nothing to unwind
     * and would otherwise close the app from on top of the sheet. */
    useBackHandler(open && !isDesktop, () => setOpen(false))

    const title = `Add people to ${group?.name ?? "the parish"}`
    const description =
        "They are whitelisted immediately and can sign in whenever they like. No email is sent — tell them however you normally would."

    const trigger = (
        <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            className="h-11 w-fit px-8"
        >
            Add people
        </Button>
    )

    if (isDesktop) {
        return (
            <>
                {trigger}
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>{title}</DialogTitle>
                            <DialogDescription>{description}</DialogDescription>
                        </DialogHeader>
                        <InviteForm
                            group={group}
                            invite={invite}
                            inviting={inviting}
                            onDone={() => setOpen(false)}
                        />
                    </DialogContent>
                </Dialog>
            </>
        )
    }

    return (
        <>
            {trigger}
            {/* repositionInputs is off for the same reason as the comments drawer: Vaul's
              * implementation keeps react-aria's scroll lock installed, which swallows the
              * tap that should focus the textarea inside the Capacitor WebView. Keeping the
              * form clear of the keyboard is KeyboardAwareColumn's job instead. */}
            <Drawer open={open} onOpenChange={setOpen} repositionInputs={false}>
                <DrawerContent className="max-h-[85dvh]">
                    <KeyboardAwareColumn>
                        <DrawerHeader className="shrink-0 text-left">
                            <DrawerTitle>{title}</DrawerTitle>
                            <DrawerDescription>{description}</DrawerDescription>
                        </DrawerHeader>
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                            {open && (
                                <InviteForm
                                    group={group}
                                    invite={invite}
                                    inviting={inviting}
                                    onDone={() => setOpen(false)}
                                />
                            )}
                        </div>
                    </KeyboardAwareColumn>
                </DrawerContent>
            </Drawer>
        </>
    )
}

const SettingsUsersPage = () => {
    const {
        members, group, skeleton: loading,
        invite, inviting, updating, restore, revoke, setVocation,
    } = useMembers()

    const [pageSize, setPageSize] = useState(10)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState("")
    const now = useNow()

    /* Filtered here rather than on the server. The roster is a parish — hundreds of rows,
     * already all in the store — so a round trip per keystroke would buy nothing and cost
     * the instant feedback that makes a search box worth having. It is also why there is no
     * debounce: there is nothing to debounce. */
    const visible = useMemo(() => {
        const query = search.trim().toLowerCase()
        return members.filter((member) => matchesQuery(member, query))
    }, [members, search])

    /* Typing while on page 4 would otherwise leave the reader staring at an empty table, so
     * narrowing the list returns them to the top. */
    const onSearch = useCallback((value) => {
        setSearch(value)
        setPage(1)
    }, [])

    const total = visible.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(page, totalPages)
    const pageRows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    const filtered = total !== members.length

    return (
        <PrivilegedRoute role={ROLES.ADMIN}>
            <section className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-xl font-semibold text-foreground">
                        {/* The count follows the search, so it always describes the table
                          * underneath it; the roster total is appended only when the two
                          * differ, so "how many of how many" never has to be worked out. */}
                        <span className="text-muted-foreground">
                            ({total}
                            {filtered && ` of ${members.length}`})
                        </span>{" "}
                        {group?.name ?? "Members"}
                    </h2>
                    <Admissions group={group} invite={invite} inviting={inviting} />
                </div>

                {/* Input renders its own relative wrapper for the leading icon, so the
                  * sizing goes on a box around it rather than on the field. */}
                <div className="w-full sm:max-w-xs">
                    <Input
                        icon="search"
                        type="search"
                        value={search}
                        onChange={(event) => onSearch(event.target.value)}
                        aria-label="Search members"
                        placeholder="Search by name or email"
                        className="h-11"
                    />
                </div>

                <div className="overflow-hidden pb-2">
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
                                            <TableHead className="w-44">Vocation</TableHead>
                                            <TableHead className="w-24 text-center">isAdmin</TableHead>
                                            <TableHead className="w-28">Status</TableHead>
                                            <TableHead className="w-40">Activity</TableHead>
                                            <TableHead className="w-28 text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pageRows.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={6}
                                                    className="h-24 text-center text-muted-foreground"
                                                >
                                                    {filtered
                                                        ? "Nobody matches that."
                                                        : "No members found."}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            pageRows.map((member) => {
                                                const busy = Boolean(updating[member.membershipId])
                                                const activity = activityOf(member, now)
                                                const revoked =
                                                    member.status === MEMBERSHIP_STATUS.REVOKED

                                                return (
                                                    <TableRow
                                                        key={member.membershipId}
                                                        className={cn("*:py-4", busy && "opacity-60")}
                                                    >
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
                                                                        {member.isSelf && (
                                                                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                                                                                (you)
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                    <span className="text-sm text-muted-foreground">
                                                                        {member.email}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </TableCell>

                                                        <TableCell>
                                                            {/* Editable inline: people are
                                                              * tonsured and ordained, so this
                                                              * changes over a life in the
                                                              * parish, not just at admission. */}
                                                            <Picker
                                                                value={member.vocation}
                                                                options={VOCATION_OPTIONS}
                                                                onChange={(value) =>
                                                                    setVocation(member.membershipId, value)
                                                                }
                                                                disabled={busy}
                                                                label={`Vocation for ${member.fullName}`}
                                                                className="w-40"
                                                            />
                                                        </TableCell>

                                                        <TableCell>
                                                            {/* The icon is an inline span, so
                                                              * `text-center` on the cell alone
                                                              * would not move it — it needs a
                                                              * box to be centred within. */}
                                                            <div className="flex justify-center">
                                                                <YayOrNay value={member.role === ROLES.ADMIN} />
                                                            </div>
                                                        </TableCell>

                                                        <TableCell>
                                                            <Badge variant={STATUS_VARIANT[member.status]}>
                                                                {roleLabel(member.status)}
                                                            </Badge>
                                                        </TableCell>

                                                        <TableCell
                                                            className={cn(
                                                                "text-sm",
                                                                activity.muted
                                                                    ? "text-muted-foreground"
                                                                    : "text-foreground",
                                                            )}
                                                        >
                                                            {activity.label}
                                                        </TableCell>

                                                        {/* An admin may not remove themselves —
                                                          * `updateMembership` rejects it, and in a
                                                          * single-admin parish it would lock the
                                                          * parish out of its own roster. The cell
                                                          * is empty rather than disabled: there is
                                                          * no state in which this becomes
                                                          * available, so offering it greyed out
                                                          * would only invite the click. */}
                                                        <TableCell className="text-right">
                                                            {member.isSelf ? null : revoked ? (
                                                                <Button
                                                                    variant="outline"
                                                                    disabled={busy}
                                                                    onClick={() => restore(member.membershipId)}
                                                                    className="h-11 px-6"
                                                                >
                                                                    Restore
                                                                </Button>
                                                            ) : (
                                                                <Button
                                                                    variant="ghost"
                                                                    disabled={busy}
                                                                    onClick={() => revoke(member.membershipId)}
                                                                    className="h-11 px-6 text-destructive hover:text-destructive"
                                                                >
                                                                    Remove
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })
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
        </PrivilegedRoute>
    )
}

export default SettingsUsersPage
