"use client"

import { useRef, useState } from "react"
import { AnimatePresence } from "motion/react"

import Icon from "@/components/Icon"
import Transition from "@/components/Transition"
import { Avatar } from "@/components/Widgets"
import { CommentsSkeleton } from "@/components/Skeleton"
import HeartOutline from "@/assets/svg/icons/heart-outline.svg"
import Heart from "@/assets/svg/icons/heart.svg"
import CommentOutline from "@/assets/svg/icons/comment-outline.svg"
import More from "@/assets/svg/icons/more.svg"
import Ripple from "@/assets/svg/ripple.svg"
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useNow } from "@/lib/hooks/useNow.hook"
import { useScrollLock } from "@/lib/hooks/useScroll.hook"
import { useComments } from "@/lib/store/comments/hook"
import { cn, formatCompact, timeAgoCompact, timeAgoMacro } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

/* A single comment: author + relative time, body, and the like meter (heart
 * toggle + tally) in the right column. */
const CommentRow = ({ comment, now, onToggleLike }) => {
    const { author, text, created_at, likes, liked } = comment
    return (
        <div className="flex items-start gap-3 px-4 py-2.5">
            <Avatar name={author.name} src={author.avatar} className="size-9" />
            <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                    <span className="font-semibold">{author.handle}</span>{" "}
                    <span className="text-muted-foreground">
                        · {timeAgoCompact(now, new Date(created_at).getTime())}
                    </span>
                </p>
                <p className="text-sm leading-snug wrap-break-word font-medium">{text}</p>
            </div>
            <div className="flex flex-col items-center gap-1 pt-1.5">
                <button
                    type="button"
                    onClick={onToggleLike}
                    aria-pressed={liked}
                    aria-label={liked ? "Unlike comment" : "Like comment"}
                    className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
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
            className="flex shrink-0 items-center gap-3 p-4 border-t"
        >
            <Avatar name={viewer.name} src={viewer.avatar} className="size-9" />
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

const CommentsDrawer = ({ post, open, onOpenChange }) => {
    /* Vaul guards <body>, but the app scrolls the document itself — without this the
     * feed keeps scrolling behind the sheet, taking the post you opened comments on
     * with it. */
    useScrollLock(open)

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            {/* dvh, not vh: on a mobile browser vh is the tall viewport, so the composer
                at the foot of the drawer would sit under the browser's own toolbar. */}
            <DrawerContent className="h-[85dvh] max-h-[85dvh] pb-(--safe-bottom)">
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
    const { comments, skeleton, hasMore, loadMore, loadingMore, toggleLike, add, viewer } =
        useComments(post.id)
    const now = useNow()
    const [liked, setLiked] = useState(post.liked)
    const composerRef = useRef(null)
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
        <div className={cn("flex min-h-0 flex-col", className)}>
            <header className="flex shrink-0 items-center gap-3 px-4 py-3">
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

            <div className="shrink-0 px-4 pt-3 pb-1">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => setLiked((v) => !v)}
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
                    {formatCompact(post.likes + (liked && !post.liked ? 1 : 0))} likes
                </p>
                <p className="text-xs font-medium text-muted-foreground pb-2">
                    {timeAgoMacro(now, new Date(post.created_at).getTime())}
                </p>
            </div>

            <CommentComposer viewer={viewer} onSubmit={add} inputRef={composerRef} />
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
