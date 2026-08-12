"use client"

import { useCallback, useEffect } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"

import Carousel from "@/components/Carousel"
import { CommentsPanel } from "@/components/Comments"
import Icon from "@/components/Icon"
import { Close } from "@/components/Widgets"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { usePost } from "@/lib/store/feed/hook"
import { appPath, cn, SLIDE_TRANSITION } from "@/lib/utils"

/* The post's media. Desktop is sized by a *definite* height so the box width derives
 * from the media's aspect ratio (the dialog then shrinks to media + rail), capped at
 * `95vw − rail` so a wide photo can't shove the rail off-screen. Mobile is capped by
 * height so the comment thread always keeps room on short screens. Carousels reuse
 * the `bare` variant (fills its box, dots overlaid). */
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
                        : "mx-auto w-full max-w-[42dvh]",
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
                    : "mx-auto max-h-[42dvh] w-auto",
            )}
        />
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
 * `variant="modal"` is the intercepted soft-nav overlay — this component is the
 * registered surface for the `/p` slide route, rendered by <SlideRouter/> in the shell
 * (not by the `@modal` slot) so the instance outlives the slot teardown and can animate
 * out with its `postId` intact. `variant="page"` is the hard-nav / deep-link fallback
 * (portaled to <body> so it escapes the layout's scroll container and covers the
 * viewport); it passes the id from the route params. */
const PostView = ({ variant = "modal", postId }) => {
    const router = useRouter()
    const isDesktop = useIsDesktop()
    const mounted = useMounted()

    const { post } = usePost(postId)

    const dismiss = useCallback(() => {
        if (window.history.length > 1) router.back()
        else router.push(ROUTES.DEFAULT)
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

    const overlay = (
        <motion.div
            className={cn(
                "fixed z-50",
                isDesktop
                    ? "inset-0 flex items-center justify-center"
                    : "inset-x-0 top-0 bottom-(--bottombar-height) flex flex-col bg-background",
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
                    <div className="relative z-10 flex h-[90dvh] w-auto max-w-[95vw] overflow-hidden rounded-2xl bg-black">
                        {post ? (
                            <>
                                <div className="flex h-full shrink-0 items-center bg-black">
                                    <PostMedia post={post} desktop />
                                </div>
                                <aside className="flex h-full w-(--commentbar-width) shrink-0 flex-col border-l bg-popover">
                                    <h2 className="sr-only">
                                        Comments on {post.author.handle}&apos;s post
                                    </h2>
                                    <CommentsPanel post={post} className="flex-1" />
                                </aside>
                            </>
                        ) : (
                            <div className="flex h-full w-[min(90vw,28rem)] items-center justify-center bg-popover">
                                <NotFound />
                            </div>
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

                    {/* The media is cached in the feed, so it paints immediately — no page
                     * skeleton. Only the comment thread loads (its skeleton lives inside
                     * CommentsPanel via useComments). */}
                    <div className="flex min-h-0 flex-1 flex-col">
                        {post ? (
                            <>
                                <div className="shrink-0 bg-black">
                                    <PostMedia post={post} />
                                </div>
                                <CommentsPanel post={post} className="flex-1" />
                            </>
                        ) : (
                            <NotFound />
                        )}
                    </div>
                </>
            )}
        </motion.div>
    )

    /* The hard-nav page portals to <body> to escape the layout's scroll container
     * (a low z-1 context) and cover the viewport. The modal is rendered inline by
     * <SlideRouter/> (already above the nav) so its exit isn't trapped in a portal. */
    if (variant === "page") return mounted ? createPortal(overlay, document.body) : null
    return overlay
}

export default PostView
