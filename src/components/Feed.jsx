"use client"

import { useState } from "react"

import Icon from "@/components/Icon"
import HeartOutline from "@/assets/svg/icons/heart-outline.svg"
import Heart from "@/assets/svg/icons/heart.svg"
import CommentOutline from "@/assets/svg/icons/comment-outline.svg"
import { appPath, cn, gradientFor } from "@/lib/utils"

/* Up-to-two-letter initials from a display name, for the gradient avatar fallback. */
const initials = (name) =>
    String(name ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()

/* Deterministic gradient avatar — every author maps to a stable, distinct color
 * via gradientFor(), with their initials on top. */
const Avatar = ({ name, className }) => (
    <span
        className={cn(
            "flex shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold text-white",
            className,
        )}
        style={gradientFor(name)}
        aria-hidden="true"
    >
        {initials(name)}
    </span>
)

/* A single Instagram-style feed card: header, media, action row, likes, caption. */
const PostCard = ({ post }) => {
    const [liked, setLiked] = useState(post.liked)

    /* Optimistically reflect the viewer's own like in the count. */
    const likeCount = post.likes + (liked && !post.liked ? 1 : 0)

    return (
        <article className="flex flex-col">
            <header className="flex items-center gap-3 pb-3">
                <Avatar name={post.author.name} className="size-9" />
                <div className="flex min-w-0 flex-col leading-tight">
                    <div className="flex items-center gap-1">
                        <span className="truncate text-sm font-semibold">
                            {post.author.username}
                        </span>
                        {post.author.verified && (
                            <Icon size="xs" className="text-sky-500 [font-variation-settings:'FILL'_1]">
                                verified
                            </Icon>
                        )}
                        <span className="whitespace-nowrap text-sm text-muted-foreground">
                            • {post.timeAgo}
                        </span>
                    </div>
                    {post.location && (
                        <span className="truncate text-xs text-muted-foreground">
                            {post.location}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    aria-label="Post options"
                    className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
                >
                    <Icon>more_horiz</Icon>
                </button>
            </header>

            <div className="relative aspect-4/5 w-full overflow-hidden rounded-lg bg-muted">
                <img
                    src={appPath(post.image)}
                    alt=""
                    className="size-full object-cover"
                />
            </div>

            <div className="flex items-center pt-4 *:p-2">
                <button
                    type="button"
                    onClick={() => setLiked((v) => !v)}
                    aria-pressed={liked}
                    aria-label={liked ? "Unlike" : "Like"}
                    className="transition-transform active:scale-90"
                >
                    <span className="relative block size-6">
                        <HeartOutline
                            aria-hidden="true"
                            className={cn(
                                "absolute inset-0 size-6 transition-opacity duration-300 ease-in-out",
                                liked ? "opacity-0" : "opacity-100",
                            )}
                        />
                        <Heart
                            aria-hidden="true"
                            className={cn(
                                "absolute inset-0 size-6 transition-opacity duration-300 ease-in-out",
                                liked ? "opacity-100" : "opacity-0",
                            )}
                        />
                    </span>
                </button>
                <button
                    type="button"
                    aria-label="Comment"
                    className="flex items-center gap-1 text-sm font-medium"
                >
                    <CommentOutline className="size-6 text-foreground" />
                    {post.comments > 0 && <span>{post.comments}</span>}
                </button>
            </div>

            <p className="pt-2 text-sm font-semibold">
                {likeCount.toLocaleString()} likes
            </p>

            <p className="pt-1 text-sm leading-snug">
                <span className="font-semibold">{post.author.username}</span>{" "}
                {post.caption}
            </p>

            {post.comments > 0 && (
                <button
                    type="button"
                    className="w-fit pt-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    View all {post.comments} comments
                </button>
            )}
        </article>
    )
}

/* The home feed: a centered, single-column stack of post cards. */
const Feed = ({ posts = [] }) => (
    <div className="flex flex-col">
        {posts.map((post) => (
            <div key={post.id} className="py-6 first:pt-0">
                <PostCard post={post} />
            </div>
        ))}
    </div>
)

export default Feed
