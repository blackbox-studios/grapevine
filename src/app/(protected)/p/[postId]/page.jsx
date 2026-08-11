"use client"

import PostDetail from "@/components/PostDetail"

/* The plain post route (`/p/:id`). This renders on a hard navigation or refresh —
 * a cold deep link with no feed behind it. Soft navigations from within the app
 * are caught by the `@modal` interceptor instead (see (protected)/@modal), which
 * overlays the same surface on top of the still-mounted feed. */
const PostPage = () => <PostDetail />

export default PostPage
