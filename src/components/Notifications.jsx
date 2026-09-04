"use client"

import { useCallback, useState } from "react"
import { AnimatePresence } from "motion/react"

import Ripple from "@/assets/svg/ripple.svg"
import HeartIcon from "@/assets/svg/icons/heart-outline.svg"
import Icon from "@/components/Icon"
import Transition from "@/components/Transition"
import { NOTIFICATION_ROW, NotificationsSkeleton } from "@/components/Skeleton"
import { Avatar, FollowButton } from "@/components/Widgets"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ROUTES } from "@/lib/constants"
import { useNow } from "@/lib/hooks/useNow.hook"
import { openSlide, pushRoute } from "@/lib/hooks/useSlideRoute.hook"
import { useNotifications, useUnreadCount } from "@/lib/store/notifications/hook"
import { useOpenProfile } from "@/lib/store/profile/hook"
import { useEventsView } from "@/lib/store/signups/hook"
import { cn, formatDayHeading, postPath, signupPath, timeAgoCompact } from "@/lib/utils"

/* The notifications panel, and the bell that opens it.
 *
 * **One list, three places it can appear.** <NotificationList/> is the panel's whole body and
 * knows nothing about how it is presented: the desktop popover in the nav rail renders it, and
 * so does the mobile slide route at `/notifications` (see components/NotificationsView.jsx),
 * in both its in-app and cold-load forms. Keeping the list separate from its container is what
 * stops "a notification" from meaning something slightly different on a phone.
 *
 * The bell is lit by `unread`, and reading happens on open — mounting <NotificationList/> is
 * what marks them read, because every surface that shows it is only mounted while open. See
 * `useNotifications`. */

/* What each event type says, in the panel's two-line shape: who, then what they did.
 *
 * Written here rather than shipped by the API for the same reason a name is sent in parts —
 * this is copy, and copy belongs next to the layout that has to fit it. Each entry takes the
 * projected notification so a line can use more than the type (NEW_POST names the group,
 * which is the only way to tell two parishes' announcements apart in a panel that is not
 * scoped to either). */
const LINES = {
    POST_LIKE: () => "liked your post",
    COMMENT_LIKE: () => "liked your comment",
    POST_COMMENT: () => "commented on your post",
    FOLLOW: () => "followed you",
    NEW_POST: (item) =>
        item.orgName ? `posted in ${item.orgName}` : "shared a new post",
}

/* The two kinds nobody did to you.
 *
 * A reminder comes from a clock and a cancellation comes from the parish, so neither has an
 * actor worth naming — the row would otherwise read "@robpaul is coming up", the reader's own
 * handle in front of a sentence about a rota. See `notifySignupReminder` for why the column
 * points at the recipient anyway.
 *
 * So these get a **whole sentence** rather than a predicate appended to a handle, and a glyph
 * rather than a face. They are written here with the rest of the copy, and they are the reason
 * the row below branches at all. */
const SIGNUP_LINES = {
    SIGNUP_REMINDER: (item) =>
        item.signup
            ? `${item.signup.title} — ${formatDayHeading(item.signup.startsAt)}. You signed up.`
            : "You have a sign-up coming up.",
    SIGNUP_CANCELED: (item) =>
        item.signup
            ? `${item.signup.title} on ${formatDayHeading(item.signup.startsAt)} was cancelled.`
            : "A date you signed up for was cancelled.",
}

/* The corner radius one row takes, given the rows around it.
 *
 * A run of unread rows reads as one block — rounded at its two ends, square where rows meet —
 * so the neighbours that decide this are the unread ones, and a highlight ending halfway down
 * the list still closes itself off. A run of one is a pill.
 *
 * A read row is always a pill: it draws no background until the cursor is on it, and a hover
 * is one row being pointed at rather than part of anything. One radius serves both states,
 * because a row shows the tint or the hover and never both.
 *
 * `rounded-3xl` rather than `rounded-t-full` at the ends: `rounded-full` on a 56px row clamps
 * to 28px corners, and rounding only two of them lifts that clamp into a 56px dome. */
const runRadius = (items, index) => {
    if (items[index].read) return "rounded-full"

    const opens = index === 0 || items[index - 1].read
    const closes = index === items.length - 1 || items[index + 1].read

    if (opens && closes) return "rounded-full"
    return cn(opens && "rounded-t-3xl", closes && "rounded-b-3xl")
}

/* One row: a picture, one sentence, and — where there is one — the answer to it.
 *
 * **Three columns, and each is its own target.** The picture opens the person, the sentence
 * opens what happened, and the right-hand column is the action. Splitting them is what lets a
 * reader go to whoever liked their post without opening the post, which one button over the
 * whole row cannot express.
 *
 * The sentence is **one wrapping paragraph, not a name over a subtitle** — handle, what they
 * did, and how long ago, in that order, wrapping to as many lines as it needs. That is what
 * makes the timestamp part of the sentence rather than a column of its own, and it is what
 * leaves the right-hand column free for the action. Nothing truncates: a row is three or four
 * words and reads better on two lines than cut off on one.
 *
 * **The handle leads, not the display name.** A notification is about identity — who this is —
 * where a byline over a post is about address, and the @handle is the name that is unique and
 * that the reader can act on. It is also what the card the row opens is keyed by.
 *
 * The picture is <Avatar/>, which falls back to the same deterministic gradient and initials a
 * byline uses — so the person who liked your post looks identical to the person who wrote one.
 *
 * A FOLLOW fills the action column with **Follow back**, and it is the only type that fills it
 * today. It stays up once the follow is made, reading "Following", because a control that
 * vanished under the thumb that just tapped it would reflow the row and leave the state
 * unreadable a week later. The write is the profile store's, the same one the card's own button
 * calls, so every copy of the answer on screen moves together.
 *
 * `read` tints the row rather than hiding it. How long that tint lives is `markRead`'s
 * decision, not this component's. */
const NotificationRow = ({ item, now, onOpen, onOpenActor, className }) => {
    const line = LINES[item.type]
    const signupLine = SIGNUP_LINES[item.type]

    return (
        /* A wrapper around the targets rather than one button around everything: a button
           nested in a button is markup the browser will not keep, and there are three of them
           here. The tint, the radius and the hover stay out here, so the row still highlights
           as one thing however many things are in it.

           The box comes from NOTIFICATION_ROW, which the skeleton uses too — restyling the
           row's padding means editing that constant, not this line. The radius arrives as
           `className` because it depends on the rows either side; see `runRadius`.

           Hover is for read rows only: an unread row already sits at `bg-accent`, and shifting
           it under the cursor would read as the row changing state. */
        <div
            className={cn(
                NOTIFICATION_ROW,
                "transition-colors",
                item.read ? "hover:bg-accent" : "bg-accent",
                className,
            )}
        >
            {/* A glyph where a face would be, for the rows that have no actor. The disc is the
                avatar's size so the column does not shift between one kind of row and the next,
                and it is not a button: there is nobody behind it to open. */}
            {signupLine ? (
                <span
                    aria-hidden="true"
                    className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-full",
                        item.type === "SIGNUP_CANCELED"
                            ? "bg-destructive/12 text-destructive"
                            : "bg-brand/15 text-foreground",
                    )}
                >
                    <Icon size="md">
                        {item.type === "SIGNUP_CANCELED" ? "event_busy" : "event_available"}
                    </Icon>
                </span>
            ) : (
                <button
                    type="button"
                    aria-label={`Open @${item.actor.handle}`}
                    onClick={() => onOpenActor(item)}
                    className="shrink-0 cursor-pointer rounded-full"
                >
                    <Avatar person={item.actor} className="size-10" />
                </button>
            )}

            <button
                type="button"
                onClick={() => onOpen(item)}
                className="min-w-0 flex-1 cursor-pointer text-left"
            >
                <p className="text-sm leading-snug text-foreground">
                    {signupLine ? (
                        signupLine(item)
                    ) : (
                        <>
                            <span className="font-semibold">@{item.actor.handle}</span>{" "}
                            {line ? line(item) : "did something"}
                        </>
                    )}{" "}
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                        {timeAgoCompact(now, new Date(item.createdAt).getTime())}
                    </span>
                </p>
            </button>

            {item.type === "FOLLOW" && (
                <FollowButton person={item.actor} label="Follow back" className="shrink-0" />
            )}
        </div>
    )
}

const EmptyState = () => (
    <div className="py-12 text-center text-sm text-muted-foreground">
        Nothing yet. Likes, comments, follows, and new announcements will show up here.
    </div>
)

/* The panel's body: the rows, their skeleton, and the way to the next page.
 *
 * Mounting this is what opens the panel — the fetch and the mark-as-read both hang off
 * `useNotifications`, so a container only has to render it at the right moment rather than
 * orchestrate anything.
 *
 * `onOpened` is what a container that is not itself a slide route uses to get out of the
 * way: the desktop popover closes itself, because a post opening behind a menu that stayed
 * put would leave the reader with two things on screen and one of them stale. The mobile
 * slide route passes nothing — it *wants* to stay mounted, so the post stacks over it and
 * dismissing comes back here. */
export const NotificationList = ({ className, onOpened }) => {
    const { items, skeleton, hasMore, loadingMore, loadMore } = useNotifications()
    const { openProfile } = useOpenProfile()
    const { setTab } = useEventsView()
    const now = useNow()

    const openSubject = useCallback((item) => {
        if (item.signup) {
            /* Straight to the rota's own URL. `pushRoute`, not `openSlide`: a rota is a page
             * runtime route rather than an overlay — see `<EventsView/>`. The tab is set too,
             * so backing out of the rota lands on the sign-ups half rather than the calendar. */
            setTab("signups")
            pushRoute(signupPath(item.signup.sheetId))
        } else if (item.postId) openSlide(postPath(item.postId))
        else if (item.actor?.handle) openProfile(item.actor.handle)
        else return

        onOpened?.()
    }, [onOpened, openProfile, setTab])

    /* The picture, which goes to the person whatever the row is about. */
    const openActor = useCallback((item) => {
        if (!item.actor?.handle) return
        openProfile(item.actor.handle)
        onOpened?.()
    }, [onOpened, openProfile])

    return (
        <div className={cn("overflow-y-auto overscroll-contain", className)}>
            <AnimatePresence mode="wait" initial={false}>
                {skeleton ? (
                    <Transition fast key="skeleton">
                        <NotificationsSkeleton />
                    </Transition>
                ) : items.length === 0 ? (
                    <Transition fast key="empty">
                        <EmptyState />
                    </Transition>
                ) : (
                    <Transition fast key="content">
                        <ul className="flex flex-col gap-1 px-2">
                            {items.map((item, index) => (
                                <li key={item.id}>
                                    <NotificationRow
                                        item={item}
                                        now={now}
                                        onOpen={openSubject}
                                        onOpenActor={openActor}
                                        className={runRadius(items, index)}
                                    />
                                </li>
                            ))}
                        </ul>

                        {hasMore && (
                            <div className="flex justify-center py-3">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={loadingMore}
                                    onClick={loadMore}
                                    className="text-muted-foreground"
                                >
                                    {loadingMore ? (
                                        <Ripple
                                            aria-label="Loading notifications"
                                            className="size-5 [&_circle]:stroke-current"
                                        />
                                    ) : (
                                        "Show more"
                                    )}
                                </Button>
                            </div>
                        )}
                    </Transition>
                )}
            </AnimatePresence>
        </div>
    )
}

/* The bell, with its dot.
 *
 * Subscribes to the tally alone — it is mounted in the app's chrome for the whole session, so
 * re-rendering it whenever a page is appended to a list it does not show would be a
 * subscription to the wrong thing.
 *
 * **`ref` and `...props` are forwarded, and that is load-bearing rather than tidy.** This is
 * the desktop popover's `<PopoverTrigger asChild>`, and `asChild` works by handing the child
 * everything the trigger would have rendered — the ref it positions against, `aria-expanded`,
 * `data-state`, and the pointer and keyboard handlers that actually open the thing. A
 * component that destructures the two props it cares about and drops the rest silently
 * swallows all of it, and the trigger renders perfectly while doing nothing at all.
 *
 * The dot's ring colour is passed in because the two places this sits have different
 * backgrounds behind it: the nav rail's `bg-sidebar` on desktop, the page's `bg-background` at
 * the top of the feed on a phone. */
export const NotificationsBell = ({ ref, ringClassName = "ring-sidebar", className, ...props }) => {
    const unread = useUnreadCount()

    return (
        <button
            ref={ref}
            type="button"
            aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
            className={cn(
                "relative -m-1 cursor-pointer rounded-full p-1 outline-hidden",
                className,
            )}
            {...props}
        >
            {/* `size-6` is required, not decorative: heart-outline.svg carries a viewBox and
                no width/height (unlike bell-outline.svg, which was 24x25 intrinsically), so
                without a size class it renders at the SVG default of 300x150 and the dot's
                corner offsets land nowhere near the glyph. */}
            <HeartIcon className="size-6" />
            {unread > 0 && (
                <span
                    className={cn(
                        "absolute top-0.5 right-0.5 size-2.5 rounded-full bg-brand ring-2",
                        ringClassName,
                    )}
                />
            )}
        </button>
    )
}

/* Mobile: the bell opens `/notifications` as a slide route, so the feed behind it stays
 * mounted and is pushed aside exactly as it is for a post. `openSlide`, never `router.push` —
 * a real navigation would unmount the surface the push needs. */
export const NotificationsTrigger = ({ className }) => (
    <NotificationsBell
        onClick={() => openSlide(ROUTES.NOTIFICATIONS)}
        ringClassName="ring-background"
        className={className}
    />
)

/* Desktop: the same list in a popover off the nav rail, unchanged in shape from before —
 * a title, then the rows. Radix unmounts the content when closed, which is what makes
 * mounting <NotificationList/> the same event as opening the panel.
 *
 * Controlled rather than uncontrolled, for one reason: a row opens the post over the feed,
 * and the menu it was tapped in has to get out of the way itself — Radix has no idea a
 * surface appeared behind it, so it would sit there over the post the reader just asked
 * for. */
const NotificationsMenu = () => {
    const [open, setOpen] = useState(false)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <NotificationsBell />
            </PopoverTrigger>
            <PopoverContent
                side="right"
                align="end"
                sideOffset={16}
                className="flex w-88 flex-col gap-0 overflow-hidden py-2 px-0 h-[clamp(400px,50dvh,600px)]"
            >
                {/* `text-xl`, matching <NotificationsView/>. This is the same panel at a
                    different size, so its title should not change rank with the container. */}
                <div className="flex items-center justify-between px-5 pt-3.5 pb-3">
                    <h3 className="text-xl font-semibold tracking-tight">Notifications</h3>
                </div>

                <NotificationList
                    className="min-h-0 flex-1 pb-2"
                    onOpened={() => setOpen(false)}
                />
            </PopoverContent>
        </Popover>
    )
}

export default NotificationsMenu
