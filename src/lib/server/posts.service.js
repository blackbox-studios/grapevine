import "server-only"

import { MOCK_LATENCY_MS, MOCK_WRITE_LATENCY_MS } from "@/lib/constants"
import { mockDelay, mockId } from "@/lib/mock"
import { paginate } from "@/lib/server/cursor"
import { notFound, invalid } from "@/lib/server/errors"
import { COMMENTS, FEED, VIEWER } from "@/lib/server/seed"

/* Business logic for posts and comments. Services own the data access and throw AppError
 * on failure — they never see a Request or a Response, which is what keeps them
 * transport-agnostic and lets the route handlers stay three lines long.
 *
 * Every read awaits `mockDelay(MOCK_LATENCY_MS)` so the latency a real backend would have
 * lives here, on the server, rather than being faked in the client store. That is what
 * guarantees a loading skeleton is on screen long enough to read (see
 * `backend-architecture.md` → Mocked latency), and it is why stores must not add a floor of
 * their own. Writes settle faster so an optimistic mutation reconciles promptly.
 *
 * These are the seams to replace with Prisma queries. Nothing above this file — no route
 * handler, store, hook, or component — should need to change when they are. */

const findPost = (postId) => FEED.find((post) => post.id === postId)

/* One page of the feed, newest first. */
export const listFeed = async ({ limit, cursor }) => {
    await mockDelay(MOCK_LATENCY_MS)
    return paginate(FEED, { limit, cursor })
}

/* One post's full detail. This is what the app fetches when a post is opened, so it is the
 * endpoint that lets post ids stay unknown until runtime. It returns the same shape the
 * feed does today; a real implementation would add the things a detail view needs and the
 * feed card doesn't (full comment counts, related posts, permissions). */
export const getPost = async (postId) => {
    await mockDelay(MOCK_LATENCY_MS)
    const post = findPost(postId)
    if (!post) throw notFound("Post not found.")
    return post
}

/* One page of a post's comments, oldest first. 404s on an unknown post rather than
 * returning an empty page, so a bad id is distinguishable from a post with no comments. */
export const listComments = async (postId, { limit, cursor }) => {
    await mockDelay(MOCK_LATENCY_MS)
    if (!findPost(postId)) throw notFound("Post not found.")
    return paginate(COMMENTS[postId] ?? [], { limit, cursor })
}

/* Toggles the viewer's like on a post and returns the resulting state. Returning the
 * authoritative `{ liked, likes }` rather than 204 is what lets the client reconcile its
 * optimistic guess instead of having to re-fetch the post. */
export const togglePostLike = async (postId) => {
    await mockDelay(MOCK_WRITE_LATENCY_MS)
    const post = findPost(postId)
    if (!post) throw notFound("Post not found.")

    post.liked = !post.liked
    post.likes += post.liked ? 1 : -1
    return { liked: post.liked, likes: post.likes }
}

export const toggleCommentLike = async (commentId) => {
    await mockDelay(MOCK_WRITE_LATENCY_MS)
    const comment = Object.values(COMMENTS)
        .flat()
        .find((c) => c.id === commentId)
    if (!comment) throw notFound("Comment not found.")

    comment.liked = !comment.liked
    comment.likes += comment.liked ? 1 : -1
    return { liked: comment.liked, likes: comment.likes }
}

/* Posts a comment as the current viewer. The server assigns the id, the author, and the
 * timestamp — never the client — so the created resource it returns is the authoritative
 * one the client swaps its optimistic row for. Also bumps the post's tally, keeping the
 * count the feed renders consistent with the thread's length. */
export const addComment = async (postId, text) => {
    await mockDelay(MOCK_WRITE_LATENCY_MS)

    const post = findPost(postId)
    if (!post) throw notFound("Post not found.")

    const body = String(text ?? "").trim()
    if (!body) throw invalid("Comment text is required.", { text: "Required" })

    const comment = {
        id: mockId("cmt"),
        author: VIEWER,
        text: body,
        created_at: new Date().toISOString(),
        likes: 0,
        liked: false,
    }

    COMMENTS[postId] = [comment, ...(COMMENTS[postId] ?? [])]
    post.comments += 1

    return comment
}
