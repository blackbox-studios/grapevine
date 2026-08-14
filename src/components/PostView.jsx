"use client"

import { useCallback, useEffect } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"

import PostModal from "@/components/PostModal"
import PostSlide from "@/components/PostSlide"
import { ROUTES } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { closeSlide } from "@/lib/hooks/useSlideRoute.hook"
import { usePost } from "@/lib/store/post/hook"

/* The single, URL-driven surface for one post (`/p/:id`) — reused for every way a post is
 * opened. It owns the data and lifecycle (the fetch, dismissal, Escape) and delegates the
 * *presentation* to one of two components, which behave differently enough that branching on
 * `isDesktop` throughout a single component had grown unwieldy:
 *
 *  - Desktop → <PostModal/>, a centered dialog on a dimmed backdrop (media + comment rail).
 *  - Mobile  → <PostSlide/>, a full-height Reels-style sheet the media fills, comments raised
 *    on demand.
 *
 * Crossing the breakpoint unmounts one and mounts the other — cheap, because the post itself
 * lives in the store above this (usePost), so nothing refetches on a resize or rotate.
 *
 * Both presentations come from the same registry entry in <SlideRouter/> — there is no
 * `/p/[postId]` page file, so no post id is ever enumerated at build time. `variant="modal"`
 * is the in-app overlay, rendered by <SlideRouter/> in the shell so the instance outlives the
 * URL change that opened it and can animate out with its `postId` intact. `variant="page"` is
 * the cold-load fallback (a refresh or a shared link), resolved from the pathname by
 * <SlidePage/> and portaled to <body> so it escapes the shell's page wrapper and covers the
 * viewport. */
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

    const surface = isDesktop ? (
        <PostModal post={post} skeleton={skeleton} dismiss={dismiss} />
    ) : (
        <PostSlide variant={variant} post={post} skeleton={skeleton} dismiss={dismiss} />
    )

    /* The hard-nav page portals to <body> to escape the shell's page wrapper (a low z-1
     * context, and one a slide route may be mid-transform on) and cover the viewport.
     * The modal is rendered inline by <SlideRouter/> (already above the nav) so its exit
     * isn't trapped in a portal. */
    if (variant === "page") return mounted ? createPortal(surface, document.body) : null
    return surface
}

export default PostView
