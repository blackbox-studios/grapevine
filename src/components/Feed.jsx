"use client"

import { useCallback, useRef, useState } from "react"
import { motion } from "motion/react"
import useMeasure from "react-use-measure"

import Carousel from "@/components/Carousel"
import { usePinchZoom } from "@/components/PinchZoom"
import Comments from "@/components/Comments"
import Icon from "@/components/Icon"
import { Avatar } from "@/components/Widgets"
import HeartOutline from "@/assets/svg/icons/heart-outline.svg"
import Heart from "@/assets/svg/icons/heart.svg"
import CommentOutline from "@/assets/svg/icons/comment-outline.svg"
import More from "@/assets/svg/icons/more.svg"
import Ripple from "@/assets/svg/ripple.svg"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useNow } from "@/lib/hooks/useNow.hook"
import { useInfiniteScroll } from "@/lib/hooks/useScroll.hook"
import { openSlide } from "@/lib/hooks/useSlideRoute.hook"
import { usePostLike } from "@/lib/store/post/hook"
import { appPath, cn, formatCompact, postPath, timeAgoCompact } from "@/lib/utils"

/* Roughly two lines of caption at the feed's column width before truncating. */
const CAPTION_LIMIT = 100

/* Instagram-style caption: the author handle in bold followed by the post body.
 * Long bodies truncate at a word boundary with an inline "... more" affordance.
 *
 * The caption stays a single inline paragraph so the body wraps naturally, and the
 * "more" word simply disappears on expand. Radix's Collapsible can't do this — its
 * content is a separate block, which would break the sentence onto its own line — so
 * we animate height ourselves: `react-use-measure` reports the paragraph's natural
 * height, and a `motion.div` tweens to it once the text swaps preview → full. */
const Caption = ({ label, text }) => {
    const [open, setOpen] = useState(false)
    const [ref, { height }] = useMeasure()

    const isLong = text.length > CAPTION_LIMIT
    const preview = isLong
        ? text.slice(0, CAPTION_LIMIT).replace(/\s+\S*$/, "")
        : text


    return (
        <motion.div
            className="overflow-hidden text-sm leading-snug"
            initial={false}
            animate={{ height: height || "auto" }}
            transition={{ duration: 0.4, ease: [0, 0.4, 0, 1] }}
        >
            <p ref={ref}>
                <span className="font-semibold">{label}</span>{" "}
                {open || !isLong ? text : preview}
                {isLong && !open && (
                    <>
                        {" ... "}
                        <button
                            type="button"
                            onClick={() => setOpen(true)}
                            className="text-muted-foreground transition-colors hover:text-foreground"
                        >
                            more
                        </button>
                    </>
                )}
            </p>
        </motion.div>
    )
}

/* A single Instagram-style feed card: header, media, action row, likes, caption. */
const PostCard = ({ post }) => {
    const [commentsOpen, setCommentsOpen] = useState(false)
    const now = useNow()
    const isDesktop = useIsDesktop()
    /* The heart's state is the post's, not the card's: the same post can also be on screen
     * in the open overlay, and both have to agree. The store applies the tap optimistically
     * and reconciles against the server, so this still flips on the current frame. */
    const { toggleLike } = usePostLike()
    const { liked } = post

    const { handle, name, avatar, verified } = post.author

    /* A post carries either a single `image` or an `images` array (carousel). */
    const images = post.images ?? (post.image ? [post.image] : [])

    /* Pinch-to-peek the single-image card in place (touch only): a two-finger gesture lifts a
     * clone of the photo above the feed and springs it back on release. The tap that opens the
     * post is untouched — a pinch is multi-touch, so it never fires a click. Carousels handle
     * their own pinch via the `zoomable` prop below. */
    const singleMediaRef = useRef(null)
    const mediaPinch = usePinchZoom(singleMediaRef, () => {
        const img = singleMediaRef.current?.querySelector("img")
        if (!img) return null
        return { src: img.currentSrc || img.src, rect: img.getBoundingClientRect() }
    })

    /* Opening a post always goes to `/p/:id` — a shareable URL — but via openSlide rather
     * than router.push: the surface overlays the *live* feed (the adaptive PostView: a
     * centered dialog on desktop, a swipe-in sheet on mobile), so the feed has to stay
     * mounted with its scroll offset untouched. A real navigation would unmount it and
     * drop the reader back at the top on dismiss. See useSlideRoute.hook.js. */
    const openPost = useCallback(() => {
        openSlide(postPath(post.id))
    }, [post.id])

    /* The comment icon opens that same post surface on desktop; on mobile it keeps the
     * lightweight bottom drawer (comments only, feed stays put behind it). */
    const openComments = useCallback(() => {
        if (isDesktop) openPost()
        else setCommentsOpen(true)
    }, [isDesktop, openPost])

    return (
        <article className="flex flex-col">
            <header className="flex items-center gap-3 pb-3">
                <Avatar name={name} src={avatar} className="size-9" />
                <div className="flex min-w-0 flex-col leading-tight">
                    <div className="flex items-center gap-1">
                        <span className="truncate text-sm font-semibold">
                            {name}
                        </span>
                        {verified && (
                            <Icon size="xs" className="text-sky-500 [font-variation-settings:'FILL'_1]">
                                verified
                            </Icon>
                        )}
                        <span className="whitespace-nowrap text-sm text-muted-foreground">
                            • {timeAgoCompact(now, new Date(post.created_at).getTime())}
                        </span>
                    </div>
                    {post.group && (
                        <span className="truncate text-xs text-muted-foreground">
                            {post.group}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    aria-label="Post options"
                    className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
                >
                    <Icon>more_horiz</Icon>
                </button>
            </header>

            {post.title && (
                <h2 className="pb-3 text-lg leading-none">{post.title}</h2>
            )}

            {/* On mobile the media breaks out of the feed's gutter to sit edge-to-edge (the
             * `-mx-4` cancels the shell's `px-4`, and it's a stretched flex item so the
             * negative margins widen it rather than just shifting it); from md it rejoins the
             * padded, rounded column. The surrounding text keeps the gutter either way. */}
            {images.length > 1 ? (
                <div className="-mx-4 md:mx-0">
                    <Carousel images={images} onImageClick={openPost} zoomable />
                </div>
            ) : (
                images.length === 1 && (
                    <button
                        ref={singleMediaRef}
                        type="button"
                        onClick={openPost}
                        aria-label="Open post"
                        className="-mx-4 block cursor-pointer overflow-hidden rounded-none bg-muted md:mx-0 md:rounded-lg"
                    >
                        <img
                            src={appPath(images[0])}
                            alt=""
                            width={post.width}
                            height={post.height}
                            className="h-auto w-full"
                        />
                        {mediaPinch}
                    </button>
                )
            )}

            {post.document && (
                <a
                    href="#"
                    className={cn(
                        "flex items-center gap-3 rounded-lg border bg-muted/40 p-3 transition-colors hover:bg-muted",
                        images.length > 0 && "mt-3",
                    )}
                >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
                        <Icon>description</Icon>
                    </span>
                    <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-sm font-medium">
                            {post.document.name}
                        </span>
                        <span className="text-xs uppercase text-muted-foreground">
                            {post.document.type} · {post.document.size}
                        </span>
                    </span>
                    <Icon className="ml-auto text-muted-foreground">download</Icon>
                </a>
            )}

            <div className="flex items-center pt-2">
                <div className="flex items-center text-sm font-medium">
                    <button
                        type="button"
                        onClick={() => toggleLike(post.id)}
                        aria-pressed={liked}
                        aria-label={liked ? "Unlike" : "Like"}
                        className="p-2 cursor-pointer transition-transform hover:scale-105 active:scale-95"
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
                                    "absolute inset-0 size-6 transition-opacity duration-300 ease-in-out",
                                    liked ? "opacity-100" : "opacity-0",
                                )}
                            />
                        </span>
                    </button>
                    {post.likes > 0 && (
                        <span className="tracking-tight tabular-nums">{formatCompact(post.likes)}</span>
                    )}
                </div>
                <button
                    type="button"
                    aria-label="Comment"
                    onClick={openComments}
                    className="flex cursor-pointer items-center text-sm font-medium"
                >
                    <span className="p-2 transition-transform hover:scale-105 active:scale-95">
                        <CommentOutline className="size-6 text-foreground" />
                    </span>
                    {post.comments > 0 && (
                        <span className="tracking-tight tabular-nums">{formatCompact(post.comments)}</span>
                    )}
                </button>
            </div>

            {post.likedBy && (
                <div className="flex items-center gap-2 py-2 text-sm">
                    <Avatar name={post.likedBy} className="size-5" />
                    <span>
                        Liked by{" "}
                        <span className="font-semibold">{post.likedBy}</span>
                        {post.likes > 1 && (
                            <>
                                {" "}and{" "}
                                <span className="font-semibold">
                                    {(post.likes - 1).toLocaleString()} others
                                </span>
                            </>
                        )}
                    </span>
                </div>
            )}

            {post.body && (
                <Caption label={handle} text={post.body} />
            )}

            <Comments
                post={post}
                open={commentsOpen}
                onOpenChange={setCommentsOpen}
            />
        </article>
    )
}

/* The home feed: a centered, single-column stack of post cards, one page at a time.
 *
 * The feed is paginated over the wire (`GET /api/feed?cursor=`), so this only ever holds
 * the pages that have been asked for; `hasMore` comes from the server's cursor being
 * non-null, never from a known total. */
const Feed = ({ posts = [], hasMore = false, loadingMore = false, onLoadMore }) => {
    /* Auto-load the next page as the reader nears the end, driven off the scroll container's
     * position — only armed while there's more to fetch. The button below stays as a manual
     * fallback (and its spinner is the visible "loading" state) for the rare case the content
     * is too short to scroll into the trigger zone. */
    useInfiniteScroll(onLoadMore, { enabled: hasMore })

    return (
        <div className="flex flex-col">
            {posts.map((post) => (
                /* `initial`/`animate` only run when a node first mounts, so appended pages fade
                 * in while the rows already on screen stay put — React keeps their motion state
                 * across the re-render. The whole first page mounts together and fades in as one. */
                <motion.div
                    key={post.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="py-6 first:pt-0"
                >
                    <PostCard post={post} />
                </motion.div>
            ))}

            {hasMore && (
                <button
                    type="button"
                    onClick={onLoadMore}
                    disabled={loadingMore}
                    aria-label="Load more posts"
                    className="flex w-full cursor-pointer justify-center py-6 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none"
                >
                    {loadingMore ? (
                        <Ripple aria-label="Loading posts" className="size-8 [&_circle]:stroke-current" />
                    ) : (
                        <More className="size-6" />
                    )}
                </button>
            )}
        </div>
    )
}

export default Feed
