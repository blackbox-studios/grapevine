"use client"

import { useCallback, useRef, useState } from "react"
import { motion } from "motion/react"
import useMeasure from "react-use-measure"

import Carousel from "@/components/Carousel"
import Hyperlink from "@/components/Hyperlink"
import { usePinchZoom } from "@/components/PinchZoom"
import Comments from "@/components/Comments"
import Icon from "@/components/Icon"
import { PostMenuTrigger } from "@/components/PostMenu"
import { Reflow, ReflowItem } from "@/components/Reflow"
import { Attachment, Avatar } from "@/components/Widgets"
import HeartOutline from "@/assets/svg/icons/heart-outline.svg"
import Heart from "@/assets/svg/icons/heart.svg"
import CommentOutline from "@/assets/svg/icons/comment-outline.svg"
import More from "@/assets/svg/icons/more.svg"
import Ripple from "@/assets/svg/ripple.svg"
import { ROUTES } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useNow } from "@/lib/hooks/useNow.hook"
import { useInfiniteScroll } from "@/lib/hooks/useScroll.hook"
import { displayName } from "@/lib/name"
import { openSlide } from "@/lib/hooks/useSlideRoute.hook"
import { useCurrentOrg } from "@/lib/store/org/hook"
import { usePostLike } from "@/lib/store/post/hook"
import {
    CARD_SPRING,
    appPath,
    captionPreview,
    cn,
    formatCompact,
    postImages,
    postPath,
    timeAgoCompact,
} from "@/lib/utils"

/* Roughly two lines of caption at the feed's column width before truncating. */
const CAPTION_LIMIT = 100

/* And the budget for a post with no photo, where the writing *is* the post.
 *
 * Much larger than a caption's, and not by taste: a caption is read against the picture above
 * it, so two lines of it plus a "more" is a reasonable share of a card whose subject is
 * elsewhere. A text-only announcement has nothing else on the card at all — the same two lines
 * would fold the whole post away behind an affordance, on a card with room to spare. This is
 * around eight lines at the feed's column width, which holds a service schedule or a paragraph
 * of news whole and still stops a very long letter from owning the scroll. */
const TEXT_LIMIT = 700

/* Instagram-style caption: the author handle in bold followed by the post body.
 * Bodies truncate with an inline "... more" affordance — at a word boundary, or at the
 * author's first line break if that comes first (`captionPreview`).
 *
 * `label` is optional and `limit` varies, because a text-only post renders its body through
 * this same component without a handle in front of it and with far more room — see
 * `TEXT_LIMIT` and the layout note in <PostCard/>.
 *
 * The caption stays a single inline paragraph so the body wraps naturally, and the
 * "more" word simply disappears on expand. Radix's Collapsible can't do this — its
 * content is a separate block, which would break the sentence onto its own line — so
 * we animate height ourselves: `react-use-measure` reports the paragraph's natural
 * height, and a `motion.div` tweens to it once the text swaps preview → full.
 *
 * **`whitespace-pre-line` is what makes the author's line breaks survive.** HTML collapses
 * every run of whitespace, so a service schedule typed as one item per line arrived as a
 * single paragraph — the writing said one thing and the card said another. `pre-line` rather
 * than `pre-wrap`: it keeps the newlines and still collapses runs of spaces, so pasted text
 * with stray indentation does not stack up ragged margins, and long lines still wrap. Every
 * surface that renders a body carries it — the sheet's caption, the dialog's rail, the
 * overlay teaser — because the same post read differently on each otherwise. */
const Caption = ({ label, text, limit = CAPTION_LIMIT, className }) => {
    const [open, setOpen] = useState(false)
    const [ref, { height }] = useMeasure()

    /* Ends at the character budget or the author's first line break, whichever comes first —
     * see `captionPreview`. */
    const { preview, truncated } = captionPreview(text, limit)

    return (
        /* `className` may set the type scale but must not add padding: the animated height is
         * the paragraph's own, and with `border-box` any padding here would be subtracted from
         * the text rather than added around it, clipping the last line. Use a margin. */
        <motion.div
            className={cn("overflow-hidden text-sm leading-snug", className)}
            initial={false}
            animate={{ height: height || "auto" }}
            transition={{ duration: 0.4, ease: [0, 0.4, 0, 1] }}
        >
            <p ref={ref} className="whitespace-pre-line">
                {label && (
                    <>
                        <span className="font-semibold">{label}</span>{" "}
                    </>
                )}
                {open || !truncated ? text : preview}
                {truncated && !open && (
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

/* A single feed card, in one of two layouts.
 *
 * With a photo it is Instagram's: header, media, action row, likes, then the caption — the
 * body last, in small type, prefixed with the author's handle, because it is written *to* the
 * picture and read after it.
 *
 * With no photo none of that holds. The writing is the post, so it comes first and it is read
 * first: header, the title as a headline, the body at reading size and at length
 * (`TEXT_LIMIT`), then the action row underneath the thing it acts on. The handle comes off the
 * body — there is no picture for it to be captioning, and the author is already named in the
 * header two lines above. */
const PostCard = ({ post }) => {
    const [commentsOpen, setCommentsOpen] = useState(false)
    const now = useNow()
    const isDesktop = useIsDesktop()
    /* The heart's state is the post's, not the card's: the same post can also be on screen
     * in the open overlay, and both have to agree. The store applies the tap optimistically
     * and reconciles against the server, so this still flips on the current frame. */
    const { toggleLike } = usePostLike()
    const { liked } = post

    const { handle, verified } = post.author
    /* Composed here, not sent composed: the API ships name parts and a vocation, and this
     * is what turns them into "Dn. Paul". See lib/name.js. */
    const name = displayName(post.author)

    const images = postImages(post)
    /* No photo is not a missing photo — it is the other layout. See the header above. */
    const textOnly = images.length === 0

    const body = post.body && (
        textOnly ? (
            <Caption text={post.body} limit={TEXT_LIMIT} className="mb-1 text-base leading-normal" />
        ) : (
            <Caption label={handle} text={post.body} />
        )
    )

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
     * than router.push: the surface overlays the *live* feed (<PostView/>, which picks its own
     * presentation), so the feed has to stay mounted with its scroll offset untouched. A real
     * navigation would unmount it and drop the reader back at the top on dismiss. See
     * useSlideRoute.hook.js. */
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
                <Avatar person={post.author} className="size-9" />
                <div className="flex min-w-0 flex-col leading-tight">
                    <div className="flex items-center gap-1">
                        <span className="truncate text-sm font-semibold">
                            {name}
                        </span>
                        {verified && (
                            <Icon size="xs" className="text-brand [font-variation-settings:'FILL'_1]">
                                verified
                            </Icon>
                        )}
                        <span className="whitespace-nowrap text-sm text-muted-foreground">
                            • {timeAgoCompact(now, new Date(post.createdAt).getTime())}
                        </span>
                    </div>
                    {post.orgName && (
                        <span className="truncate text-xs text-muted-foreground">
                            {post.orgName}
                        </span>
                    )}
                </div>
                <PostMenuTrigger post={post} className="ml-auto" />
            </header>

            {post.title && (
                <h2
                    className={cn(
                        "text-lg",
                        /* A headline sits close to the body it heads and carries the weight
                           that makes it one; above a photo it is a single quiet line. */
                        textOnly ? "pb-2 font-semibold leading-snug" : "pb-3 leading-none",
                    )}
                >
                    {post.title}
                </h2>
            )}

            {textOnly && body}

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
                <Attachment
                    {...post.document}
                    href={appPath(post.document.url)}
                    className="mt-3"
                />
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
                    <Avatar person={post.likedBy} className="size-5" />
                    <span>
                        Liked by{" "}
                        <span className="font-semibold">{displayName(post.likedBy)}</span>
                        {/* "and 1 others" was reachable the moment like counts became real
                          * rather than seeded prose — a post with exactly two likes hits it. */}
                        {post.likes > 1 && (
                            <>
                                {" "}and{" "}
                                <span className="font-semibold">
                                    {(post.likes - 1).toLocaleString()}{" "}
                                    {post.likes === 2 ? "other" : "others"}
                                </span>
                            </>
                        )}
                    </span>
                </div>
            )}

            {!textOnly && body}

            <Comments
                post={post}
                open={commentsOpen}
                onOpenChange={setCommentsOpen}
            />
        </article>
    )
}

/* A group with nothing in it yet.
 *
 * **What it says depends on who is reading**, and that is the whole reason it is not one
 * sentence. An admin of a fresh group is looking at two jobs nobody has told them about —
 * publish something, and put people here to read it — so this is where they are told. A member
 * can do neither, and pointing them at a roster they cannot open would be an instruction that
 * dead-ends in a 403; they get the plain fact instead.
 *
 * Only the roster is a link, because only the roster is a place. The composer is a dialog
 * owned by the nav with no route and no store flag to open it from here, so it is named rather
 * than linked — lifting its open state into a store to make one word clickable would be a
 * store with one purpose and a lifetime nobody could name.
 *
 * **The link is the loud variant, not `soft`.** This is the one call to action on an otherwise
 * empty screen, and `soft` holds the inherited colour until the pointer is already on it — on a
 * phone, where there is no hover at all, that is a link nobody can see. `soft` is for a link
 * sitting beside a louder primary action, which is the opposite of this. */
const FeedEmpty = () => {
    const { current, isAdmin } = useCurrentOrg()

    /* No group at all is a different sentence from a group with nothing in it, and it is a
     * state only an owner reaches: `accessFor` keeps them ACTIVE with no memberships, so a
     * freshly provisioned owner meets this on their very first sign-in, and so does one who
     * has just deleted their last group. Everyone else with no memberships is stopped by the
     * gate long before the feed. Telling them "nothing has been posted here" would name a
     * group that does not exist. */
    if (!current) {
        return (
            <div className="flex flex-col items-center gap-2 px-8 py-20 text-center">
                <h2 className="text-lg font-semibold text-foreground">No groups yet</h2>
                <div className="text-sm text-muted-foreground">
                    Create your first group from the group switcher to start posting.
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center gap-2 px-8 py-20 text-center">
            <h2 className="text-lg font-semibold text-foreground">No posts yet</h2>
            <div className="text-sm text-muted-foreground">
                {isAdmin ? (
                    <>
                        Create a post with the compose button, and{" "}
                        <Hyperlink href={ROUTES.SETTINGS_USERS} className="font-medium">
                            add members
                        </Hyperlink>{" "}
                        so there is somebody to read it.
                    </>
                ) : (
                    <>Nothing has been posted in {current?.name ?? "this group"} yet.</>
                )}
            </div>
        </div>
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

    /* Before the container below, not inside it: <Reflow/> measures and animates a list, and
       an empty state is not a list item that arrived. The caller only renders this component
       once loading has settled, so an empty `posts` is a real answer rather than a pending
       one. */
    if (posts.length === 0) return <FeedEmpty />

    return (
        /* `relative` is <Reflow/>'s requirement, not decoration — read that component.
         *
         * **`-mt-6` cancels the first card's top padding, and it is here rather than on the
         * card because `first:pt-0` was a bug.** A CSS positional selector answers to *DOM*
         * order, and a card being removed stays in the DOM for the length of its exit — so
         * `:first-child` still matched the departing card the whole way through, and only
         * handed over on the frame it unmounted. The column travelled smoothly and then
         * snapped 24px upward at the end, because the new first card lost its top padding in
         * one frame with nothing animating it. Every card now carries identical padding and
         * the offset is a constant on the container, so nothing about an item's spacing
         * depends on where it sits. */
        <div className="relative -mt-6 flex flex-col">
            {/* Publishing and deleting both change what is in this list while the reader is
                looking at it, so the cards below have to travel rather than jump: a new post
                arrives at the top and everything eases down around it, a deleted one is lifted
                out and the column closes over the gap. Same component as the comment thread,
                on the softer of its two springs — a spring settles in about the same time
                whatever the distance, so the one tuned for a comment row would cover a whole
                post card in the same instant and read as the snap it is meant to replace. */}
            <Reflow>
                {posts.map((post) => (
                    <ReflowItem
                        key={post.localId ?? post.id}
                        spring={CARD_SPRING}
                        /* A just-published post is on screen before the server has confirmed
                         * it, so it rests dimmed and inert until the created resource replaces
                         * it — nothing should be likeable or openable while it still has a
                         * temporary id. */
                        opacity={post.pending ? 0.5 : 1}
                        className={cn("py-6", post.pending && "pointer-events-none")}
                    >
                        <PostCard post={post} />
                    </ReflowItem>
                ))}
            </Reflow>

            {hasMore && (
                /* Outside the presence list but on its layout: it is the foot of the same
                   column, and a button that stayed put while the cards above it moved would
                   read as belonging to something else. */
                <motion.button
                    layout="position"
                    transition={CARD_SPRING}
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
                </motion.button>
            )}
        </div>
    )
}

export default Feed
