"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence } from "motion/react"

import { ConversationPane } from "@/components/Conversation"
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
import { useRouteOpener } from "@/lib/hooks/useSlideRoute.hook"
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

const ConversationRow = ({ conversation, active, onOpen }) => {
    const { other, snippet, unread, isRequest } = conversation
    const name = other ? displayName(other) : "Conversation"

    return (
        <button
            type="button"
            onClick={() => onOpen(`${ROUTES.CONVERSATION}/${conversation.id}`)}
            className="group relative isolate flex w-full cursor-pointer items-center gap-3 pl-2 pr-1 text-left"
        >
            {/* **The fill bleeds past the row; the row's own box does not.** Reaching the
                container's edges by widening the row would drag the avatars and the text
                out with it, and they are aligned to the heading and the search field above
                them. A separate layer behind the content spreads into the surrounding
                padding on its own and leaves the layout entirely alone.

                `isolate` on the row is what makes `-z-10` mean "behind this row" rather
                than "behind the page": an absolutely positioned child paints above its
                non-positioned siblings, so without a stacking context of its own the fill
                would cover the name it is meant to sit under. */}
            <span
                aria-hidden="true"
                className={cn(
                    "pointer-events-none absolute inset-y-0 -z-10 rounded-xl transition-colors",
                    "-inset-x-3 md:-inset-x-5",
                    active ? "bg-accent" : "group-hover:bg-accent/50",
                )}
            />
            {/* **The dot hangs in the margin rather than holding a column of its own.**
                A reserved gutter is only honest if something is usually in it; here most
                rows are read, so every one of them paid an indent for a mark it did not
                have and the avatars sat visibly off to the right of everything else in
                the list. Positioned absolutely into the surrounding padding instead: the
                avatar keeps the place it would have had with no dot at all, and an unread
                row grows a mark beside it without moving anything. */}
            {unread && (
                <>
                    <span
                        aria-hidden="true"
                        className="absolute -left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-[#0a84ff]"
                    />
                    {/* The dot and the bolder name are the only marks of an unread row, and
                        both are visual. This is what the button says out loud. */}
                    <span className="sr-only">Unread.</span>
                </>
            )}

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
                        {/* The chevron promises a push, which is what a tap does on a
                            phone. Beside a pane that simply changes contents it promises
                            the wrong thing, and it costs the name the room to be read. */}
                        <Icon size="sm" className="text-muted-foreground/60 md:hidden">
                            chevron_right
                        </Icon>
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

/* The inbox, in the two shapes it takes.
 *
 * **On a phone it is one column and the thread is somewhere else** — a slide route that
 * pushes in over it, which is how a phone's own messages app works and what the back
 * gesture expects.
 *
 * **On a desktop the list and the thread are on screen together**, because there is room
 * and because a conversation read beside the list it came from is the whole reason a wide
 * screen is worth having. That makes the same URL two layouts rather than two screens:
 * `/inbox/c/:id` above the breakpoint changes which conversation the right half holds and
 * nothing else, which is why <ConversationView/> draws nothing there. The id is read from
 * the pathname rather than from state, so a link, a refresh and a tapped row all land in
 * the same place.
 *
 * A row is highlighted when it is the open one — the only affordance the desktop layout
 * needs that the phone's does not, since on a phone the open thread is covering the list.
 */
export const MessagesList = () => {
    const { available, conversations, skeleton } = useInbox()
    const isDesktop = useIsDesktop()
    const openRoute = useRouteOpener()
    const pathname = usePathname()
    const [query, setQuery] = useState("")
    const [composing, setComposing] = useState(false)

    const openId = useMemo(() => {
        const prefix = `${ROUTES.CONVERSATION}/`
        return pathname.startsWith(prefix) ? pathname.slice(prefix.length).split("/")[0] : null
    }, [pathname])

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

    const list = (
        <>
            <header className={cn("flex items-center justify-between pb-6", isDesktop && "pb-8")}>
                <h1 className={cn("font-medium pt-2", isDesktop ? "text-2xl" : "text-4xl")}>
                    Messages
                </h1>
                <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="New message"
                    onClick={() => setComposing(true)}
                    className="rounded-full -mt-1"
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
                                <ConversationRow
                                    key={conversation.id}
                                    conversation={conversation}
                                    active={conversation.id === openId}
                                    onOpen={openRoute}
                                />
                            ))}
                        </div>
                    </Transition>
                )}
            </AnimatePresence>
        </>
    )

    if (!isDesktop) {
        return (
            <div className="mx-auto flex w-full max-w-[470px] flex-col pb-10">
                {list}
                <NewMessage open={composing} onOpenChange={setComposing} />
            </div>
        )
    }

    /* **No card, no border around the whole thing.** The surface *is* the page here: it
       fills the area beside the rail (the shell drops its column for this route — see
       `FULL_BLEED_ROUTES`) and the only rule left is the hairline between the two panes.
       A bordered box floating in the middle of the viewport would read as a window
       inside the app rather than as the app.

       The list is bounded and the thread is not: a list of names has a measure it stops
       wanting to exceed, while a conversation keeps using whatever width a monitor
       offers. So the aside is clamped and the section simply takes the rest. */
    return (
        <div className="flex h-dvh w-full overflow-hidden">
            {/* Scrolls inside its own column, so the thread beside it keeps its composer
                pinned to the foot instead of both sharing one page scroll. */}
            {/* Both panels start at the rail's own top run-in, so the list heading, the
                thread header, the brand mark and the group switcher all sit on one line
                across the top of the screen. */}
            {/* **The gutter belongs to the scroller, not to the aside.** A row's hover fill
                and its unread dot both reach outside the text column on purpose, and
                `overflow-y-auto` computes `overflow-x` to `auto` as well — so with the
                padding one level up, the scroller's content edge was the clip edge and
                everything that bled past it was cut off. Inside, the same bleed lands in
                the scroller's own padding, which is not clipped. */}
            <aside className="flex w-[clamp(19rem,24vw,25rem)] shrink-0 flex-col border-r border-border/60 pt-9">
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 scrollbar-none">
                    {list}
                </div>
            </aside>

            {/* **The pane is not keyed on the conversation, and that is deliberate.**
                Keying it would tear down the header, the rail and the composer on every
                switch and build them again — and with an <AnimatePresence mode="wait">
                around it, leave the half blank in between, which is the flash. The pane
                takes the id as a prop instead, so the chrome never moves and only the
                body cross-dissolves; that fade lives inside <ConversationPane/>, where it
                can overlap the two threads without ever mounting two pollers. */}
            {/* No top run-in here: the pane's header carries it instead, so the blurred
                bar reaches the top of the screen and the bubbles pass under all of it.
                Padding on this element would end the bar at its edge, and the messages
                would disappear at a line partway up rather than behind the header. */}
            <section className="flex min-w-0 flex-1 flex-col">
                {openId ? (
                    <ConversationPane conversationId={openId} />
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 pb-16 text-center">
                        <p className="font-serif text-xl italic">Your messages</p>
                        <p className="max-w-xs text-sm text-muted-foreground">
                            Choose a conversation, or start one with someone from a group
                            you are in.
                        </p>
                    </div>
                )}
            </section>

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
    const openRoute = useRouteOpener()
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
            openRoute(`${ROUTES.CONVERSATION}/${conversationId}`)
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
                            Only the two of you will see it.
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
                    <DrawerDescription>Only the two of you will see it.</DrawerDescription>
                </DrawerHeader>
                {body}
            </DrawerContent>
        </Drawer>
    )
}
