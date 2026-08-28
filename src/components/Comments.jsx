"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"

import HoldMenu from "@/components/HoldMenu"
import Icon from "@/components/Icon"
import { PostMenuTrigger } from "@/components/PostMenu"
import { Reflow, useReflowMotion } from "@/components/Reflow"
import Transition from "@/components/Transition"
import { KeyboardAwareColumn } from "@/components/KeyboardAware"
import { Attachment, Avatar, ConfirmDialog } from "@/components/Widgets"
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
import { useEndSentinel } from "@/lib/hooks/useScroll.hook"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { useNow } from "@/lib/hooks/useNow.hook"
import { useComments } from "@/lib/store/comments/hook"
import { usePostLike } from "@/lib/store/post/hook"
import { ROW_SPRING, appPath, cn, formatCompact, timeAgoCompact, timeAgoMacro } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

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
 * The hold, the blur, the copy of the row drawn on top of it, and the menu anchored to it
 * are all `<HoldMenu/>` — read that component for why the row's content is rendered twice. */
const CommentRow = ({ comment, now, onToggleLike, onDelete }) => {
    const { author, text, createdAt, likes, liked, pending, canDelete } = comment
    const isDesktop = useIsDesktop()
    const [confirming, setConfirming] = useState(false)
    /* HoldMenu owns this row's element, so the list motion is handed to it rather than
     * applied here. Same values the composer's photo strip uses — see components/Reflow.jsx. */
    const reflow = useReflowMotion()

    /* An optimistic row has no server id to delete by, so it carries no affordance until
     * the create it is standing in for comes back. */
    const deletable = Boolean(canDelete) && !pending

    /* React state rather than a URL, so Android's back gesture has nothing to unwind and
     * would close the app from on top of it. (HoldMenu claims the gesture for its own menu.) */
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
                    <span className="min-h-4 text-xs tabular-nums text-muted-foreground font-bold">
                        {likes > 0 ? formatCompact(likes) : ""}
                    </span>
                </div>
            </div>
        </>
    )

    return (
        <>
            {/* A comment the server hasn't confirmed yet reads as in-flight rather than
              * settled, and can't be liked — it has no server id to like. That dimming is an
              * animated target rather than a class, so confirmation fades it up instead of
              * snapping, and it is HoldMenu's `opacity` because the hold has to override it.
              *
              * One item in the menu, and it is the destructive one: there is nothing else to
              * do to a comment from here, so a menu of one is the whole question. */}
            <HoldMenu
                enabled={deletable && !isDesktop}
                items={[{ label: "Delete", icon: "delete", destructive: true, onSelect: onDelete }]}
                opacity={pending ? 0.6 : 1}
                motionProps={reflow}
                className="group flex items-start gap-3 px-4 py-2.5"
            >
                {content}
            </HoldMenu>

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Delete comment?"
                description="This removes it from the thread for everyone. It cannot be undone."
                onConfirm={onDelete}
            />
        </>
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
 * is an optional node the thread opens with (the post itself, on the surfaces that render it
 * there). Presentational: all data/actions come from the owning body via props.
 *
 * **`header` sits outside the skeleton swap, because it is data the surface already has.** The
 * thread is fetched and the post is not, so covering the post with a comment skeleton would
 * hide the thing the reader opened for the length of a round trip — and on a text post, where
 * that node *is* the post, there would be nothing on screen at all. Inside the crossfade it
 * would also fade out and back in on every load, which reads as the post reloading.
 *
 * The rows sit in a `<Reflow/>` so a new comment fades in at the top while the thread below
 * it — the "load more" button included — glides down, and a deleted one is closed over
 * rather than snapped shut afterwards. See that component for what it is doing and why.
 *
 * Keyed on `localId ?? id`: an optimistic comment is swapped for the server's row under a
 * new id, and keying on `id` would replay the row's entrance on confirmation. */
const CommentsList = ({ comments, now, skeleton, hasMore, loadMore, loadingMore, toggleLike, remove, header }) => {
    /* The next page loads when the reader reaches the foot of the thread — one hook for all
     * three surfaces, since each renders this list inside its own `overflow-y-auto` panel.
     * `useEndSentinel` rather than `useInfiniteScroll` for exactly that reason: the latter
     * reads the shell's scroll container, which none of these panels move. */
    const sentinelRef = useEndSentinel({
        hasMore,
        loading: loadingMore,
        count: comments.length,
        onLoadMore: loadMore,
    })

    return (
        <div className="flex flex-col py-2">
            {header}
            <AnimatePresence mode="wait" initial={false}>
                {skeleton ? (
                    <Transition fast key="skeleton">
                        <CommentsSkeleton />
                    </Transition>
                ) : (
                    <Transition fast key="content">
                        {/* `relative` is <Reflow/>'s requirement — read that component. */}
                        <div className="relative flex flex-col">
                            <Reflow>
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
                            </Reflow>
                            {hasMore && (
                                /* The sentinel below usually gets there first, so this is the
                                 * fallback: a failed page leaves the list the same length,
                                 * which is the state that stops the sentinel re-firing, and
                                 * the reader needs something to press. */
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
                            {/* Mounted unconditionally: a node that appears only once
                              * `hasMore` is known would need a second intersection event,
                              * which a panel nobody has scrolled never produces. */}
                            <div ref={sentinelRef} aria-hidden className="h-px w-full shrink-0" />
                        </div>
                    </Transition>
                )}
            </AnimatePresence>
        </div>
    )
}

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
                className="text-sm font-semibold text-brand transition-opacity hover:opacity-80 disabled:pointer-events-none disabled:opacity-0"
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
            <DrawerHeader className="shrink-0 border-b pt-3 pb-4">
                <DrawerTitle className="text-center font-semibold">
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
 * header, the post's caption above the comment thread (one internal scroll), the post's
 * action row (like / comment), the like tally, and the composer. Reused across every
 * post surface — the desktop dialog's right rail, and both presentations of a text post,
 * all in `PostView` (`/p/:id`) — pass a `className` (e.g. `flex-1`) to size it inside its
 * parent.
 *
 * `caption` replaces the block the thread opens with. The default is the Instagram caption —
 * the author's handle in bold followed by the body — which is written to be read *under a
 * photo*. A post with no photo is not captioning anything, so its surfaces pass the post
 * itself: a headline and the body. See <PostTextView/>. */
export const CommentsPanel = ({ post, dismiss, caption, className }) => {
    const { comments, skeleton, hasMore, loadMore, loadingMore, toggleLike, add, remove, viewer } =
        useComments(post.id)
    const now = useNow()
    /* Same post, same heart as the feed card behind this surface — so the state is the
     * post's, held in the store, not this panel's. */
    const { toggleLike: togglePostLike } = usePostLike()
    const { author, liked } = post
    const composerRef = useRef(null)

    /* The caption and the attachment travel together: an opened post has no other place to
     * offer its file, and a reader who came here from the card expects to find it. */
    const lead = caption ?? (post.body || post.document ? (
        <div className="flex flex-col gap-3 px-4 pb-2 pt-4">
            {post.body && (
                <div className="flex items-start gap-3">
                    <Avatar person={author} className="mt-0.5 size-9" />
                    {/* `whitespace-pre-line` keeps the author's line breaks — see <Caption/>
                      * in components/Feed.jsx for why every body surface carries it. */}
                    <p className="whitespace-pre-line text-sm leading-snug">
                        <span className="font-semibold">{author.handle}</span> {post.body}
                    </p>
                </div>
            )}
            {post.document && (
                <Attachment {...post.document} href={appPath(post.document.url)} />
            )}
        </div>
    ) : null)

    return (
        <div className={cn("flex min-h-0 flex-col", className)}>
            <header className="flex shrink-0 items-center gap-3 px-4 py-3">
                <Avatar person={author} className="size-8" />
                <span className="text-sm font-semibold">{author.handle}</span>
                {author.verified && (
                    <Icon size="xs" className="text-brand [font-variation-settings:'FILL'_1]">
                        verified
                    </Icon>
                )}
                {/* Deleting from here takes the dialog with it — `dismiss` is why this
                  * surface's copy of the menu is not the same instance as the feed card's. */}
                <PostMenuTrigger post={post} dismiss={dismiss} className="ml-auto" />
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
                    header={lead}
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
 * edge) is already clear of it. It does need the *home indicator* cleared, because the surface
 * now runs to the very bottom of the screen rather than stopping above the mobile rail — hence
 * the `--bottom-inset - --keyboard-inset` pad, which is the indicator's height with the keyboard
 * down and zero once it is up (see the header comment in PostSlide). It sits here rather than on
 * the sheet so that the sheet collapsed to `height: 0` stays genuinely invisible: padding on a
 * border-box element survives a zero height, and would leave a strip of sheet background along
 * the bottom of the photo. In here the sheet's own `overflow-hidden` clips it. */
export const PostCommentsThread = ({ post }) => {
    const { comments, skeleton, hasMore, loadMore, loadingMore, toggleLike, add, remove, viewer } =
        useComments(post.id)
    const now = useNow()
    const { author } = post

    const caption = post.body || post.document ? (
        <div className="flex flex-col gap-3 px-4 pb-3 pt-1">
            <div className="flex items-start gap-3">
                <Avatar person={author} className="mt-0.5 size-9" />
                <div className="flex min-w-0 flex-col gap-1">
                    {/* `whitespace-pre-line` keeps the author's line breaks — see <Caption/>
                      * in components/Feed.jsx for why every body surface carries it. */}
                    {post.body && (
                        <p className="whitespace-pre-line text-sm leading-snug">
                            <span className="font-semibold">{author.handle}</span> {post.body}
                        </p>
                    )}
                    <span className="text-xs text-muted-foreground">
                        {timeAgoMacro(now, new Date(post.createdAt).getTime())}
                    </span>
                </div>
            </div>
            {/* Same as the desktop rail's: an opened post is where its file lives. */}
            {post.document && (
                <Attachment {...post.document} href={appPath(post.document.url)} />
            )}
        </div>
    ) : null

    return (
        <div className="flex h-full flex-col pb-[calc(var(--bottom-inset)-var(--keyboard-inset))]">
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
