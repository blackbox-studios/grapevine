"use client"

import { useState } from "react"
import { motion } from "motion/react"
import useMeasure from "react-use-measure"

import Carousel from "@/components/Carousel"
import PinchZoom from "@/components/PinchZoom"
import { PostCommentsThread } from "@/components/Comments"
import Icon from "@/components/Icon"
import { PostMenuTrigger } from "@/components/PostMenu"
import { PostMediaSkeleton } from "@/components/Skeleton"
import { Avatar } from "@/components/Widgets"
import { Button } from "@/components/ui/button"
import HeartOutline from "@/assets/svg/icons/heart-outline.svg"
import Heart from "@/assets/svg/icons/heart.svg"
import CommentOutline from "@/assets/svg/icons/comment-outline.svg"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { usePostLike } from "@/lib/store/post/hook"
import { appPath, cn, formatCompact, SLIDE_TRANSITION } from "@/lib/utils"

/* The comment sheet rises to this share of the surface — the media keeps the rest and shrinks
 * into it. Enough that the thread reads as the focus while the photo stays in view above it. */
const SHEET_RATIO = 0.62

/* The media, always spanning the full screen width. It never drives layout — it fills the
 * width of a flex region whose height the parent animates, and the region clips any vertical
 * overflow, so a photo taller than the room left it is cropped (Reels-style) rather than
 * letterboxed with side gaps. */
const SlideMedia = ({ post }) => {
    const images = post.images ?? (post.image ? [post.image] : [])
    if (images.length === 0) return null

    if (images.length > 1) {
        return (
            <div className="aspect-square w-full">
                <Carousel images={images} bare zoomable />
            </div>
        )
    }

    /* A single photo can be pinched to peek closer (touch only); the carousel above keeps its
     * swipe gesture and is left as-is. */
    return <PinchZoom src={appPath(images[0])} className="w-full" imgClassName="block w-full" />
}

/* One action in the Reels-style rail: a big icon over a compact tally. White with a drop
 * shadow so it stays legible over any photo. */
const RailButton = ({ label, count, pressed, onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressed}
        className="flex cursor-pointer flex-col items-center gap-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-transform hover:scale-105 active:scale-95"
    >
        {children}
        <span className="min-h-4 text-xs font-semibold tabular-nums">
            {count > 0 ? formatCompact(count) : ""}
        </span>
    </button>
)

/* The vertical like/comment rail that overlays the media's right edge — the post's own like
 * state (shared with the feed card via the store) plus the comment count. */
const ActionRail = ({ post, onComment }) => {
    const { toggleLike } = usePostLike()
    const { liked, likes, comments } = post

    return (
        <div className="flex flex-col items-center gap-5 text-white">
            <RailButton
                label={liked ? "Unlike" : "Like"}
                pressed={liked}
                count={likes}
                onClick={() => toggleLike(post.id)}
            >
                <span className="relative block size-7">
                    <HeartOutline
                        aria-hidden="true"
                        className={cn(
                            "absolute inset-0 size-7 transition-opacity duration-300 ease-in-out",
                            liked ? "opacity-0" : "opacity-100",
                        )}
                    />
                    <Heart
                        aria-hidden="true"
                        className={cn(
                            "absolute inset-0 size-7 text-current transition-opacity duration-300 ease-in-out",
                            liked ? "opacity-100" : "opacity-0",
                        )}
                    />
                </span>
            </RailButton>
            <RailButton label="Comment" count={comments} onClick={onComment}>
                <CommentOutline className="size-7" />
            </RailButton>
        </div>
    )
}

/* Empty state for a post id that doesn't resolve (bad/expired deep link). */
const NotFound = () => (
    <div className="flex flex-col items-center gap-1 px-4 text-center">
        <p className="text-base font-semibold">Post not found</p>
        <p className="text-sm text-muted-foreground">This post may have been removed.</p>
    </div>
)

/* The mobile presentation of one post (`/p/:id`): a full-height, Reels-style surface that
 * swipes in from the right (the layout slides the feed left behind it) and back out on
 * dismiss. Unlike the desktop dialog the comments are *not* shown on landing — the media
 * fills the screen with the author + caption overlaid at the foot and a like/comment rail
 * down the right. Tapping comment raises the thread from the bottom: its height animates up
 * while the media region (a `flex-1` sibling) gives up exactly that room, so the photo
 * smoothly shrinks and re-centers into place rather than being covered.
 *
 * The surface lifts to sit above the keyboard (`bottom: var(--keyboard-inset)`), so the sheet's
 * composer — pinned at the surface's own bottom edge — rides up with it and needs no keyboard
 * padding of its own. The sheet height tracks the (shrinking) surface, so it follows along too.
 *
 * **It covers the mobile rail rather than stopping above it.** The bottom is the keyboard alone,
 * not `max(--bottombar, --keyboard-inset)`: a post is the one surface that owns the whole screen,
 * and leaving the rail showing under it read as the page ending early. z-50 already clears the
 * rail's z-20, so the inset was the only thing holding it back. What `--bottombar` was quietly
 * providing, though, was clearance over the home indicator — so the two things that now sit on
 * the surface's bottom edge (the caption overlay and the raised sheet) each pad by
 * `--bottom-inset - --keyboard-inset`: the indicator's height while the keyboard is down, and
 * zero once it is up, because the surface has already been lifted clear by exactly that much and
 * a raised keyboard covers the indicator anyway. */
const PostSlide = ({ variant, post, skeleton, dismiss }) => {
    const [commentsOpen, setCommentsOpen] = useState(false)
    const [surfaceRef, { height: surfaceHeight }] = useMeasure()

    /* Android's back gesture closes the sheet first (it's React state, not a URL, so there's
     * nothing for history to unwind); a second back then dismisses the slide itself, which
     * *is* a history entry. No-op in a browser. */
    useBackHandler(commentsOpen, () => setCommentsOpen(false))

    const sheetHeight = commentsOpen ? Math.round(surfaceHeight * SHEET_RATIO) : 0

    /* The in-app modal swipes horizontally locked to the feed sliding away behind it; a cold
     * hard-nav page (nothing behind it) just fades in. */
    const anim =
        variant === "modal"
            ? { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" }, transition: SLIDE_TRANSITION }
            : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2, ease: "easeOut" } }

    return (
        <motion.div
            ref={surfaceRef}
            className="fixed inset-x-0 top-0 bottom-(--keyboard-inset) z-50 flex flex-col overflow-hidden bg-black pt-(--safe-top) transition-[bottom] duration-250 ease-out"
            {...anim}
        >
            <header className="absolute inset-x-0 top-(--safe-top) z-20 flex items-center px-2 py-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={dismiss}
                    aria-label="Go back"
                    className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] hover:bg-white/10 hover:text-white"
                >
                    <Icon>arrow_back</Icon>
                </Button>
                {/* The ellipsis, on a touch screen, because this surface has nothing to hold:
                  * the media fills it, and the media has its own gestures. The feed card's
                  * hold works because a card has a header block sitting in flow; here the
                  * only chrome is this bar, so the affordance belongs in it. Renders nothing
                  * for a reader who may not act on the post. */}
                <PostMenuTrigger
                    post={post}
                    dismiss={dismiss}
                    className="ml-auto mr-2 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] hover:text-white/80"
                />
            </header>

            {/* Media region — fills whatever the sheet leaves it. Tapping it while the sheet
             * is open dismisses the sheet (as it does in Reels), so the photo is a way back. */}
            <div
                className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
                onClick={() => commentsOpen && setCommentsOpen(false)}
            >
                {!skeleton && !post ? (
                    <NotFound />
                ) : skeleton ? (
                    <PostMediaSkeleton />
                ) : (
                    <SlideMedia post={post} />
                )}

                {/* Author + caption and the action rail, overlaid on the media and faded out
                 * once the sheet is up (it carries its own copy of the caption). */}
                {post && (
                    <motion.div
                        className="pointer-events-none absolute inset-0"
                        animate={{ opacity: commentsOpen ? 0 : 1 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                        {/* The whole author + caption block opens the comment thread, the same
                         * as the rail's comment button. */}
                        <button
                            type="button"
                            onClick={() => setCommentsOpen(true)}
                            aria-label="Open comments"
                            className="pointer-events-auto absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pb-[calc(1rem+var(--bottom-inset)-var(--keyboard-inset))] text-left text-white"
                        >
                            <div className="flex items-center gap-2">
                                <Avatar person={post.author} className="size-8" />
                                <span className="text-sm font-semibold">{post.author.handle}</span>
                                {post.author.verified && (
                                    <Icon size="xs" className="text-sky-400 [font-variation-settings:'FILL'_1]">
                                        verified
                                    </Icon>
                                )}
                            </div>
                            {post.body && (
                                <p className="mt-2 line-clamp-2 text-sm text-white/90">{post.body}</p>
                            )}
                        </button>
                        <div className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2">
                            <ActionRail post={post} onComment={() => setCommentsOpen(true)} />
                        </div>
                    </motion.div>
                )}
            </div>

            {/* The comment sheet. Its height is the single animated value: the media region
             * above reflows into whatever it leaves, which is what makes the photo find its
             * final spot smoothly. `inert` keeps its (clipped) contents out of reach while
             * collapsed. */}
            {post && (
                <motion.div
                    className="shrink-0 overflow-hidden rounded-t-2xl bg-background"
                    initial={false}
                    animate={{ height: sheetHeight }}
                    transition={SLIDE_TRANSITION}
                    inert={!commentsOpen}
                >
                    <PostCommentsThread post={post} />
                </motion.div>
            )}
        </motion.div>
    )
}

export default PostSlide
