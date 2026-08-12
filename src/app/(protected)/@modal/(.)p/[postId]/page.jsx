"use client"

import { ROUTES } from "@/lib/constants"
import { useSlideRoute } from "@/lib/hooks/useSlideRoute.hook"

/* Intercepts a soft navigation to `/p/:id` from within the app (tapping a feed photo
 * or comment icon). It renders nothing: interception alone keeps the feed mounted
 * behind the overlay, and declaring the slide route tells the shell to render and
 * animate the surface itself — see useSlideRoute + <SlideRouter/> for why the surface
 * can't live in this slot. A hard navigation / refresh bypasses this and hits the plain
 * (protected)/p/[postId] page instead. */
const PostModal = () => {
    useSlideRoute(ROUTES.POST)
    return null
}

export default PostModal
