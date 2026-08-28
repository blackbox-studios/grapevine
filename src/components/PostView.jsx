"use client"

import PostModal from "@/components/PostModal"
import PostSlide from "@/components/PostSlide"
import PostTextView from "@/components/PostTextView"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useSlideDismiss } from "@/lib/hooks/useSlideRoute.hook"
import { usePost } from "@/lib/store/post/hook"
import { postImages } from "@/lib/utils"

/* The single, URL-driven surface for one post (`/p/:id`) — reused for every way a post is
 * opened. It owns the data and lifecycle (the fetch, dismissal) and delegates the
 * *presentation* to one of three components, which behave differently enough that branching
 * throughout a single component had grown unwieldy:
 *
 *  - Desktop → <PostModal/>, a centered dialog on a dimmed backdrop (media + comment rail).
 *  - Mobile  → <PostSlide/>, a full-height Reels-style sheet the media fills, comments raised
 *    on demand.
 *  - No photo → <PostTextView/>, the writing then the conversation in one scroll, on either
 *    breakpoint. Both of the above are built around media, so a text-only announcement had
 *    been opening a photo viewer with nothing in it.
 *
 * Crossing the breakpoint unmounts one and mounts the other — cheap, because the post itself
 * lives in the store above this (usePost), so nothing refetches on a resize or rotate.
 *
 * **The text presentation is chosen from the post, so it can only be chosen once there is
 * one.** A cold load — a push notification tap, a shared link — has no cached row to seed
 * from, and until the fetch lands nothing here knows whether the post has a photo; the media
 * presentation and its skeleton hold that moment, because most posts do. A text post therefore
 * shows a beat of media skeleton before its own surface on that path alone, which is the price
 * of not guessing the other way and flashing a text layout in front of every photo.
 *
 * Both presentations come from the same registry entry in <SlideRouter/> — there is no
 * `/p/[postId]` page file, so no post id is ever enumerated at build time. `variant="modal"`
 * is the in-app overlay, rendered by <SlideRouter/> in the shell so the instance outlives the
 * URL change that opened it and can animate out with its `postId` intact. `variant="page"` is
 * the cold-load fallback (a refresh or a shared link), resolved from the pathname by
 * <SlidePage/>, which portals it clear of the shell. */
const PostView = ({ variant = "modal", postId }) => {
    const isDesktop = useIsDesktop()

    /* Unwinding the history entry openSlide pushed, plus Escape — shared with every other
     * slide route, and with the hardware back gesture for free. */
    const dismiss = useSlideDismiss()

    /* `skeleton` is false on the first frame for an in-app open — the store seeds the post
     * from the feed's cached copy, so the photo is already decoded and paints immediately
     * while the detail fetch runs silently behind it. It is only true on a cold load, where
     * there is no feed to borrow from and the fetch is the first thing that can paint. */
    const { post, skeleton } = usePost(postId)

    return post && postImages(post).length === 0 ? (
        <PostTextView variant={variant} post={post} dismiss={dismiss} />
    ) : isDesktop ? (
        <PostModal post={post} skeleton={skeleton} dismiss={dismiss} />
    ) : (
        <PostSlide variant={variant} post={post} skeleton={skeleton} dismiss={dismiss} />
    )
}

export default PostView
