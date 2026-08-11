"use client"

import PostDetail from "@/components/PostDetail"

/* Intercepts a soft navigation to `/p/:id` from within the app (e.g. tapping a
 * feed photo) and renders the detail overlay in the `@modal` slot — on top of the
 * still-mounted feed, so its scroll position is preserved. A hard navigation or
 * refresh bypasses this and hits the plain (protected)/p/[postId] page instead. */
const PostModal = () => <PostDetail />

export default PostModal
