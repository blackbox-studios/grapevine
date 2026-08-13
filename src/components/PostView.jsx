"use client"

import { useCallback, useEffect } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import useMeasure from "react-use-measure"

import Carousel from "@/components/Carousel"
import { CommentsPanel } from "@/components/Comments"
import Icon from "@/components/Icon"
import { CommentsSkeleton, PostMediaSkeleton } from "@/components/Skeleton"
import { Close } from "@/components/Widgets"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { closeSlide } from "@/lib/hooks/useSlideRoute.hook"
import { usePost } from "@/lib/store/post/hook"
import { appPath, cn, SLIDE_TRANSITION } from "@/lib/utils"

/* The post's media. Desktop is sized by a *definite* height so the box width derives
 * from the media's aspect ratio (the dialog then shrinks to media + rail), capped at
 * `95vw − rail` so a wide photo can't shove the rail off-screen. Mobile is capped by
 * height so the comment thread always keeps room on short screens. That mobile cap is a
 * share of --viewport-height rather than of dvh so the media also yields room as the keyboard
 * rises — the sheet is a fixed-height column, so a media box that held its full share of the
 * viewport would squeeze the thread's composer off the bottom the moment the field was
 * tapped. Carousels reuse the `bare` variant (fills its box, dots overlaid). */
const PostMedia = ({ post, desktop }) => {
    const images = post.images ?? (post.image ? [post.image] : [])
    if (images.length === 0) return null

    if (images.length > 1) {
        return (
            <div
                className={cn(
                    "aspect-square",
                    desktop
                        ? "h-full max-w-[calc(95vw-var(--commentbar-width))]"
                        : "mx-auto w-full max-w-[calc(var(--viewport-height)*0.42)]",
                )}
            >
                <Carousel images={images} bare />
            </div>
        )
    }

    return (
        <img
            src={appPath(images[0])}
            alt=""
            className={cn(
                "object-contain",
                desktop
                    ? "h-[90dvh] w-auto max-w-[calc(95vw-var(--commentbar-width))]"
                    : "mx-auto max-h-[calc(var(--viewport-height)*0.42)] w-auto",
            )}
        />
    )
}

/* Wraps the media in a box that eases to the media's own dimensions as it changes. The
 * inner (ref'd) node is content-sized, so `react-use-measure` reports the media's natural
 * size and the `motion.div` tweens the box to it — desktop along width (height pinned to
 * the dialog), mobile along height (width pinned full). With `initial={false}` and an
 * `"auto"` fallback the box already renders at that size, so there's nothing to animate
 * until the size actually *changes* — i.e. the cold-load skeleton resolving to the photo.
 * An in-app open (photo known on the first frame) never changes size, so it just paints. */
const PostMediaBox = ({ post, skeleton, desktop }) => {
    const [ref, { width, height }] = useMeasure()

    return (
        <motion.div
            className={cn(
                "relative shrink-0 overflow-hidden bg-black",
                desktop ? "h-[90dvh]" : "w-full",
            )}
            initial={false}
            animate={desktop ? { width: width || "auto" } : { height: height || "auto" }}
            transition={{ duration: 0.3, ease: [0, 0.4, 0, 1] }}
        >
            <div
                ref={ref}
                className={cn(
                    "flex",
                    desktop ? "h-full w-fit items-center" : "h-fit w-full justify-center",
                )}
            >
                {skeleton ? (
                    <PostMediaSkeleton desktop={desktop} />
                ) : (
                    <PostMedia post={post} desktop={desktop} />
                )}
            </div>
        </motion.div>
    )
}

/* Empty state for a post id that doesn't resolve (bad/expired deep link). */
const NotFound = () => (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
        <p className="text-base font-semibold">Post not found</p>
        <p className="text-sm text-muted-foreground">
            This post may have been removed.
        </p>
    </div>
)

/* The single, adaptive surface for one post (`/p/:id`) — reused for every way a post
 * is opened, differing only by *context*:
 *
 *  - Desktop → a centered dialog on a dimmed backdrop: media on the left, the comment
 *    rail on the right. This is the exact surface the feed's comment icon / photo tap
 *    used to open as a Radix dialog; now it's URL-driven and shareable.
 *  - Mobile  → a full-height sheet above the bottom nav: media stacked over the
 *    comment thread, with a back header. It swipes in from the right (the layout
 *    slides the feed left behind it) and back out on dismiss.
 *
 * Both presentations come from the same registry entry in <SlideRouter/> — there is no
 * `/p/[postId]` page file, so no post id is ever enumerated at build time.
 * `variant="modal"` is the in-app overlay, rendered by <SlideRouter/> in the shell so the
 * instance outlives the URL change that opened it and can animate out with its `postId`
 * intact. `variant="page"` is the cold-load fallback (a refresh or a shared link),
 * resolved from the pathname by <SlidePage/> and portaled to <body> so it escapes the
 * shell's page wrapper and covers the viewport. */
const PostView = ({ variant = "modal", postId }) => {
    const router = useRouter()
    const isDesktop = useIsDesktop()
    const mounted = useMounted()

    /* `skeleton` is false on the first frame for an in-app open — the store seeds the post
     * from the feed's cached copy, so the photo is already decoded and paints immediately
     * while the detail fetch runs silently behind it. It is only true on a cold load, where
     * there is no feed to borrow from and the fetch is the first thing that can paint. */
    const { post, skeleton } = usePost(postId)

    /* Unwinding the history entry openSlide pushed is what dismisses the overlay, so the
     * close button, Escape, and the hardware/browser back gesture are all one action.
     * A cold deep link has no such entry (this is the `page` variant, opened straight from
     * a shared URL), so there is nothing to unwind and the base route is the way out. */
    const dismiss = useCallback(() => {
        if (!closeSlide()) router.push(ROUTES.DEFAULT)
    }, [router])

    /* Escape closes the surface — the dialog affordance Radix used to give us. */
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") dismiss()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [dismiss])

    const isModal = variant === "modal"

    /* Desktop fades (dialog); the mobile modal swipes horizontally; a mobile hard-nav
     * page (nothing behind it to slide) just fades in. */
    const anim = isDesktop
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2, ease: "easeOut" } }
        : isModal
          ? { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" }, transition: SLIDE_TRANSITION }
          : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2, ease: "easeOut" } }

    /* The mobile sheet stops at the mobile rail, except while the keyboard is up, when it
     * stops at the keyboard instead — which is covering the rail anyway, and is what keeps
     * its composer reachable. It transitions so it rides the keyboard's own animation up
     * rather than jumping once the keyboard has settled; see useKeyboardInset. */
    const overlay = (
        <motion.div
            className={cn(
                "fixed z-50",
                isDesktop
                    ? "inset-0 flex items-center justify-center"
                    : "inset-x-0 top-0 bottom-[max(var(--bottombar),var(--keyboard-inset))] pt-(--safe-top) flex flex-col bg-background transition-[bottom] duration-250 ease-out",
            )}
            {...anim}
        >
            {isDesktop ? (
                <>
                    {/* Dimmed backdrop over the (still-mounted) feed; click to dismiss.
                     * Hidden from the a11y tree (the labelled Close button + Escape are
                     * the exposed affordances) so it isn't announced as a second control. */}
                    <button
                        type="button"
                        aria-hidden="true"
                        tabIndex={-1}
                        onClick={dismiss}
                        className="absolute inset-0 cursor-default bg-black/80"
                    />
                    <div className="relative z-10 flex h-[90dvh] w-auto max-w-[95vw] overflow-hidden rounded-2xl bg-black lg:border">
                        {!skeleton && !post ? (
                            <div className="flex h-full w-[min(90vw,28rem)] items-center justify-center bg-popover">
                                <NotFound />
                            </div>
                        ) : (
                            <>
                                <PostMediaBox post={post} skeleton={skeleton} desktop />
                                <aside className="flex h-full w-(--commentbar-width) shrink-0 flex-col border-l bg-popover">
                                    {skeleton ? (
                                        <CommentsSkeleton />
                                    ) : (
                                        <>
                                            <h2 className="sr-only">
                                                Comments on {post.author.handle}&apos;s post
                                            </h2>
                                            <CommentsPanel post={post} className="flex-1" />
                                        </>
                                    )}
                                </aside>
                            </>
                        )}
                    </div>
                    <Close onClick={dismiss} aria-label="Close post" className="fixed right-4 top-4 z-10" />
                </>
            ) : (
                <>
                    <header className="flex shrink-0 items-center gap-2 border-b px-2 py-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={dismiss}
                            aria-label="Go back"
                        >
                            <Icon>arrow_back</Icon>
                        </Button>
                        <span className="text-base font-semibold">Post</span>
                    </header>

                    {/* Opened in-app the media comes from the feed's cache and paints at
                     * once, so only the comment thread loads visibly (its skeleton lives
                     * inside CommentsPanel via useComments). The skeleton branch is the
                     * cold-load path, where the post itself is still in flight. */}
                    <div className="flex min-h-0 flex-1 flex-col">
                        {!skeleton && !post ? (
                            <NotFound />
                        ) : (
                            <>
                                <PostMediaBox post={post} skeleton={skeleton} />
                                {skeleton ? (
                                    <CommentsSkeleton />
                                ) : (
                                    <CommentsPanel post={post} className="flex-1" />
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        </motion.div>
    )

    /* The hard-nav page portals to <body> to escape the shell's page wrapper (a low z-1
     * context, and one a slide route may be mid-transform on) and cover the viewport.
     * The modal is rendered inline by <SlideRouter/> (already above the nav) so its exit
     * isn't trapped in a portal. */
    if (variant === "page") return mounted ? createPortal(overlay, document.body) : null
    return overlay
}

export default PostView
