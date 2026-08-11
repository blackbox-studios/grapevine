"use client"

import { useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { useParams, useRouter } from "next/navigation"
import { motion } from "motion/react"

import Carousel from "@/components/Carousel"
import { CommentsPanel } from "@/components/Comments"
import Icon from "@/components/Icon"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/constants"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { usePost } from "@/lib/store/feed/hook"
import { appPath } from "@/lib/utils"

/* The post's media, capped so the comments always keep room on short screens.
 * Carousels reuse the modal's `bare` variant (fills its box, dots overlaid); a
 * single image is letterboxed to its natural aspect. */
const DetailMedia = ({ post }) => {
    const images = post.images ?? (post.image ? [post.image] : [])
    if (images.length === 0) return null

    return (
        <div className="shrink-0 bg-black">
            {images.length > 1 ? (
                <div className="mx-auto aspect-square w-full max-w-[42dvh]">
                    <Carousel images={images} bare />
                </div>
            ) : (
                <img
                    src={appPath(images[0])}
                    alt=""
                    className="mx-auto max-h-[42dvh] w-auto object-contain"
                />
            )}
        </div>
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

/* The back-able single-post surface a photo tap opens on mobile. Shared by two
 * routes: the `@modal` interceptor (soft nav — overlays the still-mounted feed so
 * its scroll is preserved) and the plain `/p/:id` page (hard nav / refresh, when
 * there's no feed behind). Both render the exact same full-viewport overlay; the
 * only difference is what sits underneath. It reuses the desktop modal's
 * CommentsPanel verbatim (header, caption, thread, actions, composer) below the
 * media. */
const PostDetail = () => {
    const { postId: activeId } = useParams()
    const router = useRouter()
    const mounted = useMounted()

    /* `useParams` drops `postId` the instant we navigate away (its context isn't
     * frozen with the router), while the overlay lingers a beat during the leave.
     * Hold the last real id so the panel keeps showing the post through the exit
     * instead of blinking to "not found". */
    const lastId = useRef(activeId)
    if (activeId) lastId.current = activeId
    const postId = activeId ?? lastId.current

    const { post } = usePost(postId)

    const goBack = useCallback(() => {
        if (window.history.length > 1) router.back()
        else router.push(ROUTES.DEFAULT)
    }, [router])

    /* Full-viewport overlay. Portaled to <body> so it escapes the protected
     * layout's scroll container (a low `z-1` stacking context that would otherwise
     * trap it beneath the mobile bottom nav) and covers the whole screen. It owns
     * its own fade-in; the layout collapses this route onto the feed key so the
     * feed underneath never fades/scrolls on open (see (protected)/layout.jsx). */
    const overlay = (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex flex-col bg-background"
        >
            <header className="flex shrink-0 items-center gap-2 border-b px-2 py-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={goBack}
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
                        <DetailMedia post={post} />
                        <CommentsPanel post={post} className="flex-1" />
                    </>
                ) : (
                    <NotFound />
                )}
            </div>
        </motion.div>
    )

    return mounted ? createPortal(overlay, document.body) : null
}

export default PostDetail
