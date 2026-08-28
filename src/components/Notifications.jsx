"use client"

import { useCallback, useState } from "react"
import { AnimatePresence } from "motion/react"

import Ripple from "@/assets/svg/ripple.svg"
import HeartIcon from "@/assets/svg/icons/heart-outline.svg"
import Transition from "@/components/Transition"
import { NOTIFICATION_ROW, NotificationsSkeleton } from "@/components/Skeleton"
import { Avatar } from "@/components/Widgets"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ROUTES } from "@/lib/constants"
import { useNow } from "@/lib/hooks/useNow.hook"
import { openSlide } from "@/lib/hooks/useSlideRoute.hook"
import { displayName } from "@/lib/name"
import { useNotifications, useUnreadCount } from "@/lib/store/notifications/hook"
import { cn, postPath, timeAgoCompact } from "@/lib/utils"

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
    NEW_POST: (item) =>
        item.orgName ? `posted in ${item.orgName}` : "shared a new post",
}

/* The corner radius one row takes, given the rows around it.
 *
 * **Only an unread row is ever positional.** A read row draws no background of its own and
 * lights up only under the cursor, and a hover is always a pill — it is one row being pointed
 * at, not part of anything, so it has no neighbours to line up with. That is also why the two
 * cases can share a single radius: a row shows the tint or the hover, never both.
 *
 * The tint, though, marks a **run** of new notifications, and a run should read as one block:
 * rounded at its two ends, square where rows meet. The neighbours that decide this are the
 * unread ones — first and last *of the list* would end the highlight on a square edge halfway
 * down a panel holding two new notifications above eight already read.
 *
 * A run of one opens and closes at the same row, so it keeps `rounded-full` — the pill every
 * row used to be, and still the right shape for a single notification standing alone.
 *
 * `rounded-3xl` (24px) rather than `rounded-t-full` for the ends: on a 56px row a pill's
 * corners are clamped to 28px, but rounding only two of them removes the opposite corner from
 * that clamp and the top swells into a 56px dome. 24px is the token that matches what the
 * pill actually drew. */
const runRadius = (items, index) => {
    if (items[index].read) return "rounded-full"

    const opens = index === 0 || items[index - 1].read
    const closes = index === items.length - 1 || items[index + 1].read

    if (opens && closes) return "rounded-full"
    return cn(opens && "rounded-t-3xl", closes && "rounded-b-3xl")
}

/* One line: who did it, what they did, and when — and a way to the thing it is about.
 *
 * Every type points at a post, whether the subject was the post itself or a comment on it,
 * because a comment is read inside its post. So the row opens `/p/:id` with `openSlide`, the
 * same call the feed card makes. From the mobile panel that **stacks**: the post covers the
 * list and dismissing uncovers it, rather than dumping the reader back on the feed.
 *
 * The avatar is <Avatar/>, which is what puts a real profile picture here and falls back to
 * the same deterministic gradient and initials a byline uses — so the person who liked your
 * post looks identical to the person who wrote one.
 *
 * `read` tints the row rather than hiding it, and the tint outlives the badge by exactly one
 * panel. The dot clears the moment the list is on screen, but the highlight stays for as long
 * as the panel is open — it is the reader's answer to "which of these are new", and it would
 * be useless if it went in the frame they opened it. Closing the panel takes it: the next open
 * is a plain list. See `markRead` and `settleRead`. */
const NotificationRow = ({ item, now, onOpen, className }) => {
    const line = LINES[item.type]

    return (
        <button
            type="button"
            onClick={() => onOpen(item.postId)}
            /* The box comes from NOTIFICATION_ROW, which the skeleton uses too — restyling
               the row's padding means editing that constant, not this line. What is added
               here is only what does not affect layout. The radius arrives as `className`
               because it depends on the rows either side; see `runRadius`.

               **Hover is for read rows only.** An unread row is already at `bg-accent`, so
               there is nothing for a hover to add — and lightening or darkening it under the
               cursor would read as the row changing state rather than as it being pointed
               at. It stays a button either way; only the colour holds still. */
            className={cn(
                NOTIFICATION_ROW,
                "w-full cursor-pointer text-left transition-colors",
                item.read ? "hover:bg-accent" : "bg-accent",
                className,
            )}
        >
            <Avatar person={item.actor} className="size-10" />
            <div className="flex min-w-0 flex-1 items-start gap-2">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight text-foreground">
                        {displayName(item.actor)}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {line ? line(item) : "did something"}
                    </p>
                </div>
                <span className="shrink-0 pt-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                    {timeAgoCompact(now, new Date(item.createdAt).getTime())}
                </span>
            </div>
        </button>
    )
}

const EmptyState = () => (
    <div className="py-12 text-center text-sm text-muted-foreground">
        Nothing yet. Likes, comments, and new announcements will show up here.
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
    const now = useNow()

    const openPost = useCallback((postId) => {
        if (!postId) return
        openSlide(postPath(postId))
        onOpened?.()
    }, [onOpened])

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
                                        onOpen={openPost}
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
