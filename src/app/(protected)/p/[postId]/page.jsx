import PostView from "@/components/PostView"
import { postIds } from "@/lib/metadata"

/* The plain post route (`/p/:id`). Renders on a hard navigation or refresh — a cold
 * deep link with no feed behind it — as the portaled, full-viewport variant. Opened from
 * inside the app the same URL is a slide route instead: openSlide() pushes it without a
 * navigation, so the feed stays mounted underneath and <SlideRouter/> draws the overlay.
 * This page never renders in that case (see useSlideRoute.hook.js).
 *
 * This is a Server Component only so it can export generateStaticParams — the surface
 * itself (<PostView/>) is still a Client Component, and the id arrives as a prop rather
 * than through useParams. `output: "export"` (the native build) has no server to resolve
 * a dynamic segment at request time, so every reachable id has to be enumerated at build
 * time; the ids come from the same seed the feed store reads. When a real backend lands,
 * this is the one place that needs a real query (or the route needs to stop being a path
 * segment) — see native-architecture.md. */
export const generateStaticParams = () => postIds().map((postId) => ({ postId }))

const PostPage = async ({ params }) => {
    const { postId } = await params
    return <PostView variant="page" postId={postId} />
}

export default PostPage
