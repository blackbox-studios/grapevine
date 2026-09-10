"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence } from "motion/react"

import Icon from "@/components/Icon"
import Transition from "@/components/Transition"
import { Avatar } from "@/components/Widgets"
import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { ROUTES } from "@/lib/constants"
import useDebounce from "@/lib/hooks/useDebounce.hook"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { openSlide } from "@/lib/hooks/useSlideRoute.hook"
import { displayName } from "@/lib/name"
import { useInbox, useNewMessage, useStartConversation } from "@/lib/store/messages/hook"
import { cn } from "@/lib/utils"

/* The direct-message surfaces that are not the thread itself: the inbox list, the New
 * Message sheet, and the button that writes to one person from their profile card. The
 * *entrance* is a nav destination like Home or Events — see `NAV` in
 * `app/(protected)/layout.jsx`.
 *
 * The inbox is drawn to read like a phone's own messages app — a large title, rows of
 * avatar / name / snippet with the time and a chevron on the right, a blue dot for
 * unread — because a parishioner already knows how to read that screen, and the whole
 * surface should feel like the thing it is. A conversation row opens the thread as a
 * slide route, the same push-navigation their phone's messages app performs.
 *
 * **A request row is blurred.** Until the viewer accepts, the sender's face is behind
 * a blur and the row says "Message request" rather than the text — the Signal
 * pattern: the sender must not buy a lock-screen presence with a message the viewer
 * never agreed to receive. The snippet exists (it decrypted fine); it is withheld,
 * which is a different thing. */

/* Writing to one person, from a surface that already knows who they are — the
 * profile card, beside Follow.
 *
 * `onOpened` is how the surface that hosts it gets out of the way: a card is an
 * overlay and the thread is another, so the card has to close rather than be
 * covered. Renders nothing where messaging is not available (a viewer under 18, or
 * their own card), which is the same silence the nav keeps. */
export const MessageButton = ({ person, size = "sm", className, onOpened }) => {
    const { start, opening, available } = useStartConversation()

    if (!available || !person?.id || person.isSelf) return null

    return (
        <Button
            type="button"
            size={size}
            variant="outline"
            disabled={opening}
            onClick={async () => {
                const conversationId = await start(person.id)
                if (conversationId) onOpened?.()
            }}
            className={cn("rounded-full", className)}
        >
            Message
        </Button>
    )
}

/* ── The list ─────────────────────────────────────────────────────────────── */

/* iMessage's timestamp ladder: clock today, "Yesterday", weekday inside a week, then
 * a short date. Local time throughout — a message is read where it was received. */
const rowTime = (iso) => {
    const at = new Date(iso)
    const now = new Date()
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000)

    if (days <= 0) {
        return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    }
    if (days === 1) return "Yesterday"
    if (days < 7) return at.toLocaleDateString(undefined, { weekday: "long" })
    return at.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" })
}

const ConversationRow = ({ conversation }) => {
    const { other, snippet, unread, isRequest } = conversation
    const name = other ? displayName(other) : "Conversation"

    return (
        <button
            type="button"
            onClick={() => openSlide(`${ROUTES.CONVERSATION}/${conversation.id}`)}
            className="group flex w-full cursor-pointer items-center gap-3 text-left"
        >
            {/* The unread dot sits in the gutter, as the phone's own list draws it, so
                a read row and an unread row keep their avatars on one vertical line. */}
            <span className="flex w-2.5 shrink-0 items-center justify-center">
                {unread && <span className="size-2.5 rounded-full bg-[#0a84ff]" />}
            </span>

            <span className={cn("relative shrink-0", isRequest && "overflow-hidden rounded-full")}>
                <Avatar person={other} className={cn("size-12", isRequest && "blur-[6px]")} />
            </span>

            <span className="flex min-w-0 flex-1 flex-col border-b border-border/60 py-3 pr-1 group-last:border-b-0">
                <span className="flex items-baseline justify-between gap-3">
                    <span className={cn("truncate text-base", unread ? "font-semibold" : "font-medium")}>
                        {name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                        {rowTime(conversation.lastMessageAt)}
                        <Icon size="sm" className="text-muted-foreground/60">chevron_right</Icon>
                    </span>
                </span>
                <span
                    className={cn(
                        "line-clamp-2 min-h-10 text-sm leading-5",
                        isRequest ? "italic text-muted-foreground" : "text-muted-foreground",
                    )}
                >
                    {isRequest
                        ? "Message request"
                        : snippet?.text ?? (conversation.lastMessage ? "Message" : "Say hello")}
                </span>
            </span>
        </button>
    )
}

export const MessagesList = () => {
    const { available, conversations, skeleton } = useInbox()
    const [query, setQuery] = useState("")
    const [composing, setComposing] = useState(false)

    const rows = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (!needle) return conversations
        return conversations.filter((conversation) =>
            displayName(conversation.other ?? {})
                .toLowerCase()
                .includes(needle),
        )
    }, [conversations, query])

    if (!available) return null

    return (
        <div className="mx-auto flex w-full max-w-[470px] flex-col pb-10">
            <header className="flex items-center justify-between pb-4">
                <h1 className="text-4xl font-medium">Messages</h1>
                <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="New message"
                    onClick={() => setComposing(true)}
                    className="rounded-full"
                >
                    <Icon>edit_square</Icon>
                </Button>
            </header>

            <div className="pb-2">
                <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search"
                    aria-label="Search conversations"
                />
            </div>

            <AnimatePresence mode="wait" initial={false}>
                {skeleton ? (
                    <Transition fast key="skeleton">
                        <div className="flex flex-col gap-3 pt-4">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="size-12 shrink-0 animate-pulse rounded-full bg-muted" />
                                    <div className="flex flex-1 flex-col gap-2">
                                        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                                        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Transition>
                ) : rows.length === 0 ? (
                    <Transition fast key="empty">
                        <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
                            <p className="font-serif text-xl italic">No messages yet</p>
                            <p className="text-sm text-muted-foreground">
                                Start a conversation with someone from one of your groups.
                            </p>
                        </div>
                    </Transition>
                ) : (
                    <Transition fast key="content">
                        <div className="flex flex-col">
                            {rows.map((conversation) => (
                                <ConversationRow key={conversation.id} conversation={conversation} />
                            ))}
                        </div>
                    </Transition>
                )}
            </AnimatePresence>

            <NewMessage open={composing} onOpenChange={setComposing} />
        </div>
    )
}

/* ── New message ──────────────────────────────────────────────────────────── */

/* The To: sheet — a dialog on desktop, a bottom sheet on a phone, the same split as
 * every acting surface. The list is server-searched: who may be named at all is a
 * server rule (shared group, adult, reachable), and a client-side filter over a
 * pre-fetched directory would be a directory. */
const NewMessage = ({ open, onOpenChange }) => {
    const isDesktop = useIsDesktop()
    const { contacts, loaded, searching, opening, search, startWith } = useNewMessage()
    const [query, setQuery] = useState("")
    const debounced = useDebounce(query, 250)

    useEffect(() => {
        if (open) search(debounced)
        /* Closing does not clear results on purpose: reopening should paint the last
         * list while the fresh one loads. */
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, debounced])

    const pick = async (person) => {
        const conversationId = await startWith(person.id)
        if (conversationId) {
            onOpenChange(false)
            setQuery("")
            openSlide(`${ROUTES.CONVERSATION}/${conversationId}`)
        }
    }

    const body = (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="To: name or @handle"
                aria-label="Search people"
                data-vaul-no-drag
            />
            <div className="min-h-0 flex-1 overflow-y-auto" data-vaul-no-drag>
                {contacts.length === 0 ? (
                    <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                        {searching || !loaded
                            ? "Looking…"
                            : "Nobody found. You can message people who share a group with you."}
                    </p>
                ) : (
                    <div className="flex flex-col">
                        {contacts.map((person) => (
                            <button
                                key={person.id}
                                type="button"
                                disabled={opening}
                                onClick={() => pick(person)}
                                className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-accent disabled:opacity-60"
                            >
                                <Avatar person={person} className="size-10" />
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate font-medium">{displayName(person)}</span>
                                    <span className="truncate text-sm text-muted-foreground">
                                        @{person.handle}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="flex h-[min(60dvh,32rem)] flex-col">
                    <DialogHeader>
                        <DialogTitle>New message</DialogTitle>
                        <DialogDescription>
                            Messages are end-to-end encrypted.
                        </DialogDescription>
                    </DialogHeader>
                    {body}
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="h-[85dvh] px-4 pb-[calc(1rem+var(--safe-bottom))]">
                <DrawerHeader className="px-0">
                    <DrawerTitle>New message</DrawerTitle>
                    <DrawerDescription>Messages are end-to-end encrypted.</DrawerDescription>
                </DrawerHeader>
                {body}
            </DrawerContent>
        </Drawer>
    )
}
