"use client"

import { useParams } from "next/navigation"

import PostView from "@/components/PostView"

/* The plain post route (`/p/:id`). Renders on a hard navigation or refresh — a cold
 * deep link with no feed behind it — as the portaled, full-viewport variant. Soft
 * navigations from within the app are caught by the `@modal` interceptor instead
 * (see (protected)/@modal), which drives the same surface as an overlay on the live
 * feed. */
const PostPage = () => {
    const { postId } = useParams()
    return <PostView variant="page" postId={postId} />
}

export default PostPage
