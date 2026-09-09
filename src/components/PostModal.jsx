"use client"

import { motion } from "motion/react"
import useMeasure from "react-use-measure"

import Carousel from "@/components/Carousel"
import { CommentsPanel } from "@/components/Comments"
import Img from "@/components/Img"
import Video from "@/components/Video"
import { CommentsSkeleton, PostMediaSkeleton } from "@/components/Skeleton"
import { Overlay } from "@/components/Widgets"
import { appPath, mediaRatio, postImages } from "@/lib/utils"

/* The post's media. Sized by a *definite* height so the box width derives from the media's
 * aspect ratio (the dialog then shrinks to media + rail), capped at `95vw − rail` so a wide
 * photo can't shove the rail off-screen. Carousels reuse the `bare` variant (fills its box,
 * dots overlaid). */
const PostMedia = ({ post }) => {
    const images = postImages(post)

    /* A video sets its own width rather than deriving one from its height, because the height
     * here is the dialog's and 16:9 of `90dvh` is wider than most screens — the box would then
     * be clamped by `max-w` and stop being 16:9 at all. A comfortable reading width, capped the
     * same way a photo is so the comment rail is never pushed off. */
    if (post.video) {
        return (
            <div className="flex h-full w-[min(calc(95vw-var(--commentbar-width)),56rem)] items-center">
                <Video video={post.video} />
            </div>
        )
    }

    if (images.length === 0) return null

    if (images.length > 1) {
        return (
            <div
                style={{ aspectRatio: mediaRatio(post) }}
                className="h-full max-w-[calc(95vw-var(--commentbar-width))]"
            >
                <Carousel images={images} bare />
            </div>
        )
    }

    return (
        <Img
            src={appPath(images[0])}
            alt=""
            className="h-[90dvh] w-auto max-w-[calc(95vw-var(--commentbar-width))] object-contain"
        />
    )
}

/* Wraps the media in a box that eases to the media's own width as it changes (height is
 * pinned to the dialog). The inner (ref'd) node is content-sized, so `react-use-measure`
 * reports the media's natural size and the `motion.div` tweens the box to it. With
 * `initial={false}` and an `"auto"` fallback the box already renders at that size, so there's
 * nothing to animate until the size actually *changes* — i.e. the cold-load skeleton
 * resolving to the photo. An in-app open (photo known on the first frame) never changes size,
 * so it just paints. */
const PostMediaBox = ({ post, skeleton }) => {
    const [ref, { width }] = useMeasure()

    return (
        <motion.div
            className="relative h-[90dvh] shrink-0 overflow-hidden bg-black"
            initial={false}
            animate={{ width: width || "auto" }}
            transition={{ duration: 0.3, ease: [0, 0.4, 0, 1] }}
        >
            <div ref={ref} className="flex h-full w-fit items-center">
                {skeleton ? <PostMediaSkeleton desktop /> : <PostMedia post={post} />}
            </div>
        </motion.div>
    )
}

/* Empty state for a post id that doesn't resolve (bad/expired deep link). */
const NotFound = () => (
    <div className="flex h-full w-[min(90vw,28rem)] flex-col items-center justify-center gap-1 bg-popover px-4 text-center">
        <p className="text-base font-semibold">Post not found</p>
        <p className="text-sm text-muted-foreground">This post may have been removed.</p>
    </div>
)

/* The desktop presentation of one post with a photo (`/p/:id`): a centered dialog on a dimmed
 * backdrop, media on the left and the comment rail on the right. This is the exact surface the
 * feed's comment icon / photo tap used to open as a Radix dialog; now it's URL-driven and
 * shareable.
 *
 * The mobile presentation lives in a separate <PostSlide/> — the two behave so differently
 * (a fading dialog vs. a Reels-style swipe-in sheet) that <PostView/> picks between them by
 * breakpoint rather than branching on `isDesktop` throughout one component. A post with no
 * photo at all is a third surface again (<PostTextView/>).
 *
 * <Overlay/> is the dimmed, fading, click-to-dismiss box, shared with that third surface so the
 * two dialogs arrive and leave identically. */
const PostModal = ({ post, skeleton, dismiss }) => (
    <Overlay dismiss={dismiss} label="Close post">
        <div className="relative z-10 flex h-[90dvh] w-auto max-w-[95vw] overflow-hidden rounded-2xl bg-black lg:border">
            {!skeleton && !post ? (
                <NotFound />
            ) : (
                <>
                    <PostMediaBox post={post} skeleton={skeleton} />
                    <aside className="flex h-full w-(--commentbar-width) shrink-0 flex-col border-l bg-popover">
                        {skeleton ? (
                            <CommentsSkeleton />
                        ) : (
                            <>
                                <h2 className="sr-only">
                                    Comments on {post.author.handle}&apos;s post
                                </h2>
                                <CommentsPanel post={post} dismiss={dismiss} className="flex-1" />
                            </>
                        )}
                    </aside>
                </>
            )}
        </div>
    </Overlay>
)

export default PostModal
