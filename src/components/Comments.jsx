"use client"

import { useState, useSyncExternalStore } from "react"
import { AnimatePresence } from "motion/react"

import Carousel from "@/components/Carousel"
import Icon from "@/components/Icon"
import Transition from "@/components/Transition"
import { Avatar, Close } from "@/components/Widgets"
import { CommentsSkeleton } from "@/components/Skeleton"
import HeartOutline from "@/assets/svg/icons/heart-outline.svg"
import Heart from "@/assets/svg/icons/heart.svg"
import CommentOutline from "@/assets/svg/icons/comment-outline.svg"
import SendOutline from "@/assets/svg/icons/send-outline.svg"
import More from "@/assets/svg/icons/more.svg"
import Ripple from "@/assets/svg/ripple.svg"
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogPortal,
    DialogTitle,
} from "@/components/ui/dialog"
import { useNow } from "@/lib/hooks/useNow.hook"
import { useComments } from "@/lib/store/comments/hook"
import { appPath, cn, formatCompact, timeAgoCompact, timeAgoMacro } from "@/lib/utils"

/* One-shot breakpoint read. Per the brief we don't react to resizing after mount
 * (the no-op subscribe never re-fires); the overlay is opened by a click, by which
 * point the client snapshot has settled. Server snapshot is `false` (mobile). */
const NOOP_SUBSCRIBE = () => () => {}
const useIsDesktop = () =>
    useSyncExternalStore(
        NOOP_SUBSCRIBE,
        () => window.matchMedia("(min-width: 640px)").matches,
        () => false,
    )

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

/* A single comment: author + relative time, body, and the like meter (heart
 * toggle + tally) in the right column. */
const CommentRow = ({ comment, now, onToggleLike }) => {
    const { author, text, created_at, likes, liked } = comment
    return (
        <div className="flex items-start gap-3 px-4 py-2.5">
            <Avatar name={author.name} src={author.avatar} className="mt-0.5 size-9" />
            <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                    <span className="font-semibold">{author.handle}</span>{" "}
                    <span className="text-muted-foreground">
                        · {timeAgoCompact(now, new Date(created_at).getTime())}
                    </span>
                </p>
                <p className="text-sm leading-snug break-words">{text}</p>
            </div>
            <div className="flex flex-col items-center gap-1 pt-1.5">
                <button
                    type="button"
                    onClick={onToggleLike}
                    aria-pressed={liked}
                    aria-label={liked ? "Unlike comment" : "Like comment"}
                    className="transition-transform active:scale-90"
                >
                    <span className="relative block size-4">
                        <HeartOutline
                            aria-hidden="true"
                            className={cn(
                                "absolute inset-0 size-4 text-muted-foreground transition-opacity duration-300 ease-in-out",
                                liked ? "opacity-0" : "opacity-100",
                            )}
                        />
                        <Heart
                            aria-hidden="true"
                            className={cn(
                                "absolute inset-0 size-4 text-red-500 transition-opacity duration-300 ease-in-out",
                                liked ? "opacity-100" : "opacity-0",
                            )}
                        />
                    </span>
                </button>
                <span className="min-h-3 text-xs tabular-nums text-muted-foreground">
                    {likes > 0 ? formatCompact(likes) : ""}
                </span>
            </div>
        </div>
    )
}

/* Empty state for a post that has no comments yet. */
const NoComments = () => (
    <div className="flex flex-col items-center gap-1 px-4 py-16 text-center">
        <p className="text-base font-semibold">No comments yet</p>
        <p className="text-sm text-muted-foreground">Start the conversation.</p>
    </div>
)

/* The scrollable comment thread — skeleton on first load, then the rows. `header`
 * is an optional pinned node (the post caption on desktop). Presentational: all
 * data/actions come from the owning body via props. */
const CommentsList = ({ comments, now, skeleton, hasMore, loadMore, loadingMore, toggleLike, header }) => (
    <AnimatePresence mode="wait" initial={false}>
        {skeleton ? (
            <Transition fast key="skeleton">
                <CommentsSkeleton />
            </Transition>
        ) : (
            <Transition fast key="content">
                <div className="flex flex-col py-2">
                    {header}
                    {comments.length === 0 ? (
                        <NoComments />
                    ) : (
                        comments.map((comment) => (
                            <CommentRow
                                key={comment.id}
                                comment={comment}
                                now={now}
                                onToggleLike={() => toggleLike(comment.id)}
                            />
                        ))
                    )}
                    {hasMore && (
                        <button
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
                        </button>
                    )}
                </div>
            </Transition>
        )}
    </AnimatePresence>
)

/* The composer at the foot of both surfaces. Owns its own draft text. */
const CommentComposer = ({ viewer, onSubmit }) => {
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
            className="flex shrink-0 items-center gap-3 border-t p-4"
        >
            <Avatar name={viewer.name} src={viewer.avatar} className="size-9" />
            <input
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

/* Post media for the desktop modal's left pane. Sized by a *definite* height
 * (`h-[90dvh]`) so the width is derived from the media's aspect ratio — the modal
 * then shrinks to `media width + rail`. Capped at `95vw − rail` so a large photo can
 * never push the comments rail off the right edge (RAIL_W must match the aside). */
const PostMedia = ({ post }) => {
    const images = post.images ?? (post.image ? [post.image] : [])
    if (images.length > 1) {
        return (
            <div className="aspect-square h-full max-w-[calc(95vw-400px)]">
                <Carousel images={images} bare/>
            </div>
        )
    }
    if (images.length === 1) {
        return (
            <img
                src={appPath(images[0])}
                alt=""
                className="h-[90dvh] w-auto max-w-[calc(95vw-400px)] object-contain"
            />
        )
    }
    return null
}

/* -------------------------------------------------------------------------- */
/* Mobile — bottom drawer                                                     */
/* -------------------------------------------------------------------------- */

const DrawerBody = ({ post }) => {
    const { comments, skeleton, hasMore, loadMore, loadingMore, toggleLike, add, viewer } =
        useComments(post.id)
    const now = useNow()

    return (
        <>
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
                />
            </div>
            <CommentComposer viewer={viewer} onSubmit={add} />
        </>
    )
}

const CommentsDrawer = ({ post, open, onOpenChange }) => (
    <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[85vh] max-h-[85vh]">
            {open && <DrawerBody post={post} />}
        </DrawerContent>
    </Drawer>
)

/* -------------------------------------------------------------------------- */
/* Desktop — centered modal                                                   */
/* -------------------------------------------------------------------------- */

/* The right-hand rail: post header, pinned caption + comment thread, the post's
 * action row (like / comment / share / save), the like tally, and the composer. */
const DialogRail = ({ post }) => {
    const { comments, skeleton, hasMore, loadMore, loadingMore, toggleLike, add, viewer } =
        useComments(post.id)
    const now = useNow()
    const [liked, setLiked] = useState(post.liked)
    const { author } = post

    const caption = post.body ? (
        <div className="flex items-start gap-3 px-4 pb-2 pt-4">
            <Avatar name={author.name} src={author.avatar} className="mt-0.5 size-9" />
            <p className="text-sm leading-snug">
                <span className="font-semibold">{author.handle}</span> {post.body}
            </p>
        </div>
    ) : null

    return (
        <aside className="flex h-full w-[400px] shrink-0 flex-col border-l bg-popover">
            <DialogTitle className="sr-only">
                Comments on {author.handle}&apos;s post
            </DialogTitle>

            <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
                <Avatar name={author.name} src={author.avatar} className="size-8" />
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
                    header={caption}
                />
            </div>

            <div className="shrink-0 border-t px-4 pt-3 pb-1">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => setLiked((v) => !v)}
                        aria-pressed={liked}
                        aria-label={liked ? "Unlike" : "Like"}
                        className="transition-transform active:scale-90"
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
                                    "absolute inset-0 size-6 text-red-500 transition-opacity duration-300 ease-in-out",
                                    liked ? "opacity-100" : "opacity-0",
                                )}
                            />
                        </span>
                    </button>
                    <CommentOutline className="size-6" />
                    <SendOutline className="size-6" />
                    <button
                        type="button"
                        aria-label="Save"
                        className="ml-auto text-foreground transition-colors hover:text-muted-foreground"
                    >
                        <Icon>bookmark</Icon>
                    </button>
                </div>
                <p className="pt-2 text-sm font-semibold">
                    {formatCompact(post.likes + (liked && !post.liked ? 1 : 0))} likes
                </p>
                <p className="text-xxs uppercase tracking-wide text-muted-foreground">
                    {timeAgoMacro(now, new Date(post.created_at).getTime())}
                </p>
            </div>

            <CommentComposer viewer={viewer} onSubmit={add} />
        </aside>
    )
}

const CommentsDialog = ({ post, open, onOpenChange }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        {/* The dialog box is a transparent, content-sized positioning frame: it shrinks
         * to `media width + rail` at full height, so the X can hang in the dark padding
         * just off its corner while the rounded inner wrapper does the clipping. */}
        <DialogContent
            showCloseButton={false}
            aria-describedby={undefined}
            className="flex h-[90dvh] w-auto max-w-[95vw] gap-0 overflow-visible border bg-transparent p-0 shadow-none sm:max-w-[95vw]"
        >
            <div className="flex h-full overflow-hidden rounded-2xl bg-black">
                <div className="flex h-full shrink-0 items-center bg-black">
                    <PostMedia post={post} />
                </div>
                <DialogRail post={post} />
            </div>
        </DialogContent>

        {/* The Close lives in its own portal — a sibling of the content, not a child.
         * DialogContent is transform-centered (-translate-1/2), and a transformed
         * ancestor makes `fixed` resolve relative to *it*; portaling the button out
         * escapes that transform so it pins to the viewport's top-right corner. */}
        <DialogPortal>
            <DialogClose asChild>
                <Close aria-label="Close comments" className="fixed right-4 top-4 z-50" />
            </DialogClose>
        </DialogPortal>
    </Dialog>
)

/* -------------------------------------------------------------------------- */
/* Public entry                                                               */
/* -------------------------------------------------------------------------- */

/* Controlled comments surface for a post. Renders the mobile drawer or the
 * desktop modal based on the viewport at mount; the trigger (comment icon /
 * "View all comments") lives in the feed card and just flips `open`. */
const PostComments = ({ post, open, onOpenChange }) => {
    const isDesktop = useIsDesktop()

    return isDesktop ? (
        <CommentsDialog post={post} open={open} onOpenChange={onOpenChange} />
    ) : (
        <CommentsDrawer post={post} open={open} onOpenChange={onOpenChange} />
    )
}

export default PostComments
