"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import Icon from "@/components/Icon"
import Transition from "@/components/Transition"
import FocusLens, { ABOVE_LENS } from "@/components/FocusLens"
import { KeyboardAwareColumn } from "@/components/KeyboardAware"
import { Avatar } from "@/components/Widgets"
import { CommentsSkeleton } from "@/components/Skeleton"
import HeartOutline from "@/assets/svg/icons/heart-outline.svg"
import Heart from "@/assets/svg/icons/heart.svg"
import CommentOutline from "@/assets/svg/icons/comment-outline.svg"
import More from "@/assets/svg/icons/more.svg"
import Ripple from "@/assets/svg/ripple.svg"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useLongPress } from "@/lib/hooks/useLongPress.hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { useNow } from "@/lib/hooks/useNow.hook"
import { useComments } from "@/lib/store/comments/hook"
import { usePostLike } from "@/lib/store/post/hook"
import { cn, formatCompact, timeAgoCompact, timeAgoMacro } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

/* A spring, not a duration: a row travels however tall the new comment turns out to be,
 * and a fixed duration reads as hurried at one line and sluggish at six. */
const ROW_SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 }

/* Confirmation for a delete on a pointer device. Its own component so the row's markup
 * stays about the comment, and because only the desktop path asks a question — the mobile
 * one holds to reveal a single destructive item, and that hold *is* the deliberate act a
 * dialog would otherwise be asking for. */
const DeleteCommentDialog = ({ open, onOpenChange, onConfirm }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
            <DialogHeader>
                <DialogTitle>Delete comment?</DialogTitle>
                <DialogDescription>
                    This removes it from the thread for everyone. It cannot be undone.
                </DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                    Cancel
                </Button>
                <Button
                    variant="destructive"
                    onClick={() => {
                        onOpenChange(false)
                        onConfirm()
                    }}
                >
                    Delete
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
)

/* A single comment: author + relative time, body, and the like meter (heart
 * toggle + tally) in the right column.
 *
 * `layout="position"` is what slides the thread down around a new comment instead of
 * teleporting it — position only, so the text is never squashed mid-flight. Nothing here
 * animates x/y/scale: a layout animation is itself a transform animation and a second one
 * would fight it, so the arriving row only fades and all movement belongs to the rows
 * making room.
 *
 * **Deleting is two different gestures, because the two platforms offer different ones.**
 * A pointer has hover, so the trash appears beside the heart on hover and asks for
 * confirmation; a touch screen has none, so the row is held and answers with a popover
 * carrying the single destructive item. Neither is a fallback for the other and neither is
 * rendered on the wrong platform: a trash icon nobody can reveal, or a hold that duplicates
 * a visible button, are both worse than one affordance that fits.
 *
 * `canDelete` is the server's answer (own comment, or an admin of the post's group), so
 * this only ever decides *how* to offer the action, never *whether* the viewer may.
 *
 * **A held row is drawn twice.** `<FocusLens/>` blurs the entire viewport and redraws this
 * row on top of it at its measured box, because nothing inside a Vaul drawer can be raised
 * above a viewport-wide scrim — read the widget for why. So the content is a variable used
 * in both places, and the real row hides itself while the copy stands in for it. */
const CommentRow = ({ comment, now, onToggleLike, onDelete }) => {
    const { author, text, createdAt, likes, liked, pending, canDelete } = comment
    const reduceMotion = useReducedMotion()
    const isDesktop = useIsDesktop()
    const [menuOpen, setMenuOpen] = useState(false)
    const [confirming, setConfirming] = useState(false)
    /* Where the row sits in the viewport, sampled at the moment of the press — which is the
     * only moment it can be, since the lens draws its copy in viewport coordinates. */
    const [rect, setRect] = useState(null)
    const rowRef = useRef(null)

    /* An optimistic row has no server id to delete by, so it carries no affordance until
     * the create it is standing in for comes back. */
    const deletable = Boolean(canDelete) && !pending
    const held = useLongPress(
        () => {
            if (!rowRef.current) return
            setRect(rowRef.current.getBoundingClientRect())
            setMenuOpen(true)
        },
        { enabled: deletable && !isDesktop },
    )

    /* Both are open/closed React state rather than a URL, so Android's back gesture has
     * nothing to unwind and would close the app from on top of them. */
    useBackHandler(menuOpen, () => setMenuOpen(false))
    useBackHandler(confirming, () => setConfirming(false))

    const content = (
        <>
            <Avatar person={author} className="size-9" />
            <div className="min-w-0 flex flex-col gap-1 flex-1">
                <p className="text-xs leading-snug">
                    <span className="font-semibold">{author.handle}</span>{" "}
                    <span className="text-muted-foreground">
                        · {timeAgoCompact(now, new Date(createdAt).getTime())}
                    </span>
                </p>
                <p className="text-sm leading-snug wrap-break-word font-medium">{text}</p>
            </div>
            <div className="flex items-start gap-2.5 pt-1.5">
                {/* Beside the heart, because the two are the row's controls and a reader
                  * looking for one is looking in that corner. In flow rather than laid over
                  * the text: appearing on hover then reflows nothing and covers nothing, at
                  * the cost of a slightly narrower text column on the rows that carry it. */}
                {deletable && isDesktop && (
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        aria-label="Delete comment"
                        className="cursor-pointer text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 duration-300"
                    >
                        <Icon size="sm" className="leading-[0.9em]!">delete</Icon>
                    </button>
                )}
                <div className="flex flex-col items-center gap-1">
                    <button
                        type="button"
                        onClick={onToggleLike}
                        disabled={pending}
                        aria-pressed={liked}
                        aria-label={liked ? "Unlike comment" : "Like comment"}
                        className="cursor-pointer transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none"
                    >
                        <span className="relative block size-3.5">
                            <HeartOutline
                                aria-hidden="true"
                                className={cn(
                                    "absolute inset-0 size-3.5  transition-opacity duration-300 ease-in-out",
                                    liked ? "opacity-0" : "opacity-100",
                                )}
                            />
                            <Heart
                                aria-hidden="true"
                                className={cn(
                                    "absolute inset-0 size-3.5 text-current transition-opacity duration-300 ease-in-out",
                                    liked ? "opacity-100" : "opacity-0",
                                )}
                            />
                        </span>
                    </button>
                    <span className="min-h-3 text-xs tabular-nums text-muted-foreground font-bold">
                        {likes > 0 ? formatCompact(likes) : ""}
                    </span>
                </div>
            </div>
        </>
    )

    return (
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverAnchor asChild>
                {/* A comment the server hasn't confirmed yet reads as in-flight rather than
                  * settled, and can't be liked — it has no server id to like. That dimming
                  * is an animated target rather than a class, so confirmation fades it up
                  * instead of snapping.
                  *
                  * Held, it drops to fully transparent but keeps its place in the thread:
                  * the lens is drawing this row at these exact coordinates, and the copy has
                  * to be the only one of the two that is visible. */}
                <motion.div
                    ref={rowRef}
                    layout={reduceMotion ? false : "position"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: menuOpen ? 0 : pending ? 0.6 : 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ ...ROW_SPRING, opacity: { duration: 0.2, ease: "easeInOut" } }}
                    {...held}
                    className={cn(
                        "group flex items-start gap-3 px-4 py-2.5",
                        /* A hold on a paragraph is otherwise the WebView's gesture for
                          * selecting it, and the selection callout lands on top of the
                          * popover. Only rows that actually take the hold give it up. */
                        deletable && !isDesktop && "select-none",
                    )}
                >
                    {content}
                </motion.div>
            </PopoverAnchor>

            {/* The rest of the screen goes soft and this row does not. Anchored by the real
              * row's box, so the copy lands precisely where the reader pressed rather than
              * animating in from somewhere. */}
            <FocusLens active={menuOpen} rect={rect}>
                <div className="flex items-start gap-3 bg-muted px-4 py-2.5 shadow-lg">
                    {content}
                </div>
            </FocusLens>

            {/* Anchored to the row rather than floating in the middle of the sheet, the way a
              * held-item menu reads on a phone — it has to stay visibly attached to the thing
              * being acted on. Offset clear of the row instead of over it, because the row is
              * highlighted to show what the Delete would apply to and a menu covering that
              * text hides the very thing the reader is confirming. One item, and it is the
              * destructive one: there is nothing else to do to a comment from here, so a menu
              * of one is the whole question. */}
            <PopoverContent
                align="start"
                side="bottom"
                sideOffset={4}
                /* The menu is the one thing the blur must not take. */
                className={cn(ABOVE_LENS, "w-auto min-w-40 gap-0 rounded-3xl p-1.5")}
            >
                <button
                    type="button"
                    onClick={() => {
                        setMenuOpen(false)
                        onDelete()
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-base font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                    <Icon size="md">delete</Icon>
                    Delete
                </button>
            </PopoverContent>

            <DeleteCommentDialog
                open={confirming}
                onOpenChange={setConfirming}
                onConfirm={onDelete}
            />
        </Popover>
    )
}

/* Empty state for a post that has no comments yet. A sibling of the rows inside the same
 * `AnimatePresence`, so the first comment crossfades this out instead of collapsing a
 * hundred pixels out from under the arriving row. */
const NoComments = () => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: "easeInOut" }}
        className="flex flex-col items-center gap-1 px-4 py-16 text-center"
    >
        <p className="text-base font-semibold">No comments yet</p>
        <p className="text-sm text-muted-foreground">Start the conversation.</p>
    </motion.div>
)

/* The scrollable comment thread — skeleton on first load, then the rows. `header`
 * is an optional pinned node (the post caption on desktop). Presentational: all
 * data/actions come from the owning body via props.
 *
 * The rows get their own `AnimatePresence` so a new comment fades in at the top while the
 * thread below it — the "load more" button included — glides down. `initial={false}` keeps
 * the first paint quiet; `popLayout` pulls a leaving row out of the flow as it starts to
 * fade, so the thread closes over it rather than snapping shut afterwards.
 *
 * Keyed on `localId ?? id`: an optimistic comment is swapped for the server's row under a
 * new id, and keying on `id` would replay the row's entrance on confirmation. */
const CommentsList = ({ comments, now, skeleton, hasMore, loadMore, loadingMore, toggleLike, remove, header }) => (
    <AnimatePresence mode="wait" initial={false}>
        {skeleton ? (
            <Transition fast key="skeleton">
                <CommentsSkeleton />
            </Transition>
        ) : (
            <Transition fast key="content">
                <div className="flex flex-col py-2">
                    {header}
                    <AnimatePresence initial={false} mode="popLayout">
                        {comments.length === 0 ? (
                            <NoComments key="empty" />
                        ) : (
                            comments.map((comment) => (
                                <CommentRow
                                    key={comment.localId ?? comment.id}
                                    comment={comment}
                                    now={now}
                                    onToggleLike={() => toggleLike(comment.id)}
                                    onDelete={() => remove(comment.id)}
                                />
                            ))
                        )}
                    </AnimatePresence>
                    {hasMore && (
                        <motion.button
                            layout="position"
                            transition={ROW_SPRING}
                            type="button"
                            onClick={loadMore}
                            disabled={loadingMore}
                            aria-label="Load more comments"
                            className="flex w-full justify-center py-3 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none"
                        >
                            {loadingMore ? (
                                <Ripple aria-label="Loading comments" className="size-8 [&_circle]:stroke-current" />
                            ) : (
                                <More className="size-6" />
                            )}
                        </motion.button>
                    )}
                </div>
            </Transition>
        )}
    </AnimatePresence>
)

/* The composer at the foot of both surfaces. Owns its own draft text. */
const CommentComposer = ({ viewer, onSubmit, inputRef }) => {
    const [text, setText] = useState("")
    const canPost = text.trim().length > 0

    const submit = () => {
        if (!canPost) return
        onSubmit(text)
        setText("")
    }

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                submit()
            }}
            /* Vaul treats the whole drawer as a drag handle, so without this a touch that
             * starts anywhere in the composer — reaching for the field, or dragging to
             * select text in a half-typed reply — swipes the drawer shut instead. */
            data-vaul-no-drag
            className="flex shrink-0 items-center gap-3 p-4 border-t"
        >
            <Avatar person={viewer} className="size-9" />
            <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Add a comment…"
                aria-label="Add a comment"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
                type="submit"
                disabled={!canPost}
                className="text-sm font-semibold text-sky-500 transition-opacity hover:text-sky-400 disabled:pointer-events-none disabled:opacity-0"
            >
                Post
            </button>
        </form>
    )
}

/* -------------------------------------------------------------------------- */
/* Mobile — bottom drawer                                                     */
/* -------------------------------------------------------------------------- */

const DrawerBody = ({ post }) => {
    const { comments, skeleton, hasMore, loadMore, loadingMore, toggleLike, add, remove, viewer } =
        useComments(post.id)
    const now = useNow()

    return (
        /* KeyboardAwareColumn keeps the composer on top of the on-screen keyboard: the
         * thread (the scroll region) yields the room, the composer rides up. */
        <KeyboardAwareColumn>
            <DrawerHeader className="shrink-0 border-b py-3.5">
                <DrawerTitle className="text-center text-base font-semibold">
                    Comments
                </DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-gutter-stable">
                <CommentsList
                    comments={comments}
                    now={now}
                    skeleton={skeleton}
                    hasMore={hasMore}
                    loadMore={loadMore}
                    loadingMore={loadingMore}
                    toggleLike={toggleLike}
                    remove={remove}
                />
            </div>
            <CommentComposer viewer={viewer} onSubmit={add} />
        </KeyboardAwareColumn>
    )
}

const CommentsDrawer = ({ post, open, onOpenChange }) => {
    /* This drawer is open/closed React state, not a URL, so Android's back gesture has
     * nothing to unwind and would close the whole app from on top of it. Claiming the
     * gesture while it's open makes back dismiss the drawer, the way it reads on a phone.
     * No-op in a browser, where Vaul's own Escape handling already covers this. */
    useBackHandler(open, () => onOpenChange(false))

    return (
        /* repositionInputs is off because Vaul's implementation of it is unusable inside a
         * WebView, and not in a way you'd guess from the name: it keeps react-aria's
         * mobile-Safari scroll lock installed, which calls preventDefault on every touchend
         * over an input and then focuses the field itself, having first shoved it 2000px up
         * to stop Safari scrolling to it. That hand-rolled focus doesn't take in the
         * Capacitor WebView, so tapping the composer did nothing at all — no caret, no
         * keyboard, and no way to type even on a hardware one. Turning it off restores plain
         * tap-to-focus; keeping the composer above the keyboard is DrawerBody's job instead. */
        <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
            {/* dvh, not vh: on a mobile browser vh is the tall viewport, so the composer
                at the foot of the drawer would sit under the browser's own toolbar. */}
            <DrawerContent className="h-[85dvh] max-h-[85dvh]">
                {open && <DrawerBody post={post} />}
            </DrawerContent>
        </Drawer>
    )
}

/* -------------------------------------------------------------------------- */
/* Desktop — centered modal                                                   */
/* -------------------------------------------------------------------------- */

/* The full comments surface for a post as a self-contained flex column: post
 * header, pinned caption + comment thread (its own internal scroll), the post's
 * action row (like / comment), the like tally, and the composer. Reused across every
 * post surface — the desktop dialog's right rail and the mobile sheet, both in
 * `PostView` (`/p/:id`) — pass a `className` (e.g. `flex-1`) to size it inside its
 * parent. */
export const CommentsPanel = ({ post, className }) => {
    const { comments, skeleton, hasMore, loadMore, loadingMore, toggleLike, add, remove, viewer } =
        useComments(post.id)
    const now = useNow()
    /* Same post, same heart as the feed card behind this surface — so the state is the
     * post's, held in the store, not this panel's. */
    const { toggleLike: togglePostLike } = usePostLike()
    const { author, liked } = post
    const composerRef = useRef(null)

    const caption = post.body ? (
        <div className="flex items-start gap-3 px-4 pb-2 pt-4">
            <Avatar person={author} className="mt-0.5 size-9" />
            <p className="text-sm leading-snug">
                <span className="font-semibold">{author.handle}</span> {post.body}
            </p>
        </div>
    ) : null

    return (
        <div className={cn("flex min-h-0 flex-col", className)}>
            <header className="flex shrink-0 items-center gap-3 px-4 py-3">
                <Avatar person={author} className="size-8" />
                <span className="text-sm font-semibold">{author.handle}</span>
                {author.verified && (
                    <Icon size="xs" className="text-sky-500 [font-variation-settings:'FILL'_1]">
                        verified
                    </Icon>
                )}
                <button
                    type="button"
                    aria-label="Post options"
                    className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
                >
                    <Icon>more_horiz</Icon>
                </button>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-gutter-stable">
                <CommentsList
                    comments={comments}
                    now={now}
                    skeleton={skeleton}
                    hasMore={hasMore}
                    loadMore={loadMore}
                    loadingMore={loadingMore}
                    toggleLike={toggleLike}
                    remove={remove}
                    header={caption}
                />
            </div>

            <div className="shrink-0 px-4 pt-3 pb-1">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => togglePostLike(post.id)}
                        aria-pressed={liked}
                        aria-label={liked ? "Unlike" : "Like"}
                        className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                    >
                        <span className="relative block size-6">
                            <HeartOutline
                                aria-hidden="true"
                                className={cn(
                                    "absolute inset-0 size-6 transition-opacity duration-300 ease-in-out",
                                    liked ? "opacity-0" : "opacity-100",
                                )}
                            />
                            <Heart
                                aria-hidden="true"
                                className={cn(
                                    "absolute inset-0 size-6 text-current transition-opacity duration-300 ease-in-out",
                                    liked ? "opacity-100" : "opacity-0",
                                )}
                            />
                        </span>
                    </button>
                    <button
                        type="button"
                        aria-label="Comment"
                        onClick={() => composerRef.current?.focus()}
                        className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                    >
                        <CommentOutline className="size-6" />
                    </button>
                </div>
                <p className="pt-2 text-sm font-semibold">
                    {formatCompact(post.likes)} likes
                </p>
                <p className="text-xs font-medium text-muted-foreground pb-2">
                    {timeAgoMacro(now, new Date(post.createdAt).getTime())}
                </p>
            </div>

            <CommentComposer viewer={viewer} onSubmit={add} inputRef={composerRef} />
        </div>
    )
}

/* -------------------------------------------------------------------------- */
/* Mobile — Reels-style sheet (PostSlide)                                     */
/* -------------------------------------------------------------------------- */

/* The comment thread as it reads inside <PostSlide/>'s raised sheet: a drag grabber, the
 * post's caption pinned to the top of the thread, the scrolling comment rows, and the
 * composer. There is no like/comment action row here — those live on the Reels rail over the
 * media instead — which is what sets this apart from the desktop <CommentsPanel/>.
 *
 * The composer needs no keyboard padding of its own: PostSlide lifts the whole surface above
 * the keyboard, so the composer (pinned at the sheet's — and thus the surface's — bottom
 * edge) is already clear of it. */
export const PostCommentsThread = ({ post }) => {
    const { comments, skeleton, hasMore, loadMore, loadingMore, toggleLike, add, remove, viewer } =
        useComments(post.id)
    const now = useNow()
    const { author } = post

    const caption = post.body ? (
        <div className="flex items-start gap-3 px-4 pb-3 pt-1">
            <Avatar person={author} className="mt-0.5 size-9" />
            <div className="flex min-w-0 flex-col gap-1">
                <p className="text-sm leading-snug">
                    <span className="font-semibold">{author.handle}</span> {post.body}
                </p>
                <span className="text-xs text-muted-foreground">
                    {timeAgoMacro(now, new Date(post.createdAt).getTime())}
                </span>
            </div>
        </div>
    ) : null

    return (
        <div className="flex h-full flex-col">
            <div className="flex shrink-0 justify-center pb-1 pt-2">
                <span className="h-1 w-9 rounded-full bg-muted-foreground/40" />
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-gutter-stable">
                <CommentsList
                    comments={comments}
                    now={now}
                    skeleton={skeleton}
                    hasMore={hasMore}
                    loadMore={loadMore}
                    loadingMore={loadingMore}
                    toggleLike={toggleLike}
                    remove={remove}
                    header={caption}
                />
            </div>
            <CommentComposer viewer={viewer} onSubmit={add} />
        </div>
    )
}

/* -------------------------------------------------------------------------- */
/* Public entry                                                               */
/* -------------------------------------------------------------------------- */

/* Mobile comment surface: the lightweight bottom drawer (comments only) the feed's
 * comment icon flips open, leaving the feed in place behind it. Desktop opens the
 * full post surface at `/p/:id` instead (see PostView + Feed's openComments), so
 * this only ever mounts its drawer on small viewports. */
const PostComments = ({ post, open, onOpenChange }) => (
    <CommentsDrawer post={post} open={open} onOpenChange={onOpenChange} />
)

export default PostComments
