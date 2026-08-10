"use client"

import { useState } from "react"

import Icon from "@/components/Icon"
import HeartOutline from "@/assets/svg/icons/heart-outline.svg"
import Heart from "@/assets/svg/icons/heart.svg"
import CommentOutline from "@/assets/svg/icons/comment-outline.svg"
import {
    Collapsible,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { appPath, cn, gradientFor } from "@/lib/utils"

/* Compact count for the action-row tallies: 182 → "182", 2629 → "2.6K". */
const formatCount = (n) =>
    n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })

/* Up-to-two-letter initials from a display name, for the gradient avatar fallback. */
const initials = (name) =>
    String(name ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()

/* Author avatar. Uses the profile image when one is provided; otherwise falls
 * back to a deterministic gradient (via gradientFor()) with the author's initials. */
const Avatar = ({ name, src, className }) =>
    src ? (
        <img
            src={appPath(src)}
            alt=""
            aria-hidden="true"
            className={cn("shrink-0 rounded-full object-cover", className)}
        />
    ) : (
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

/* Roughly two lines of caption at the feed's column width before truncating. */
const CAPTION_LIMIT = 100

/* Instagram-style caption: the author handle in bold followed by the post body.
 * Long bodies truncate at a word boundary with an inline "... more" affordance —
 * a shadcn Collapsible drives the expanded/collapsed state. */
const Caption = ({ label, text }) => {
    const [open, setOpen] = useState(false)

    const isLong = text.length > CAPTION_LIMIT
    const preview = isLong
        ? text.slice(0, CAPTION_LIMIT).replace(/\s+\S*$/, "")
        : text

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="pt-1">
            <p className="text-sm leading-snug">
                <span className="font-semibold">{label}</span>{" "}
                {open || !isLong ? text : preview}
                {isLong && !open && (
                    <>
                        {" ... "}
                        <CollapsibleTrigger asChild>
                            <button
                                type="button"
                                className="text-muted-foreground transition-colors hover:text-foreground"
                            >
                                more
                            </button>
                        </CollapsibleTrigger>
                    </>
                )}
            </p>
        </Collapsible>
    )
}

/* A single Instagram-style feed card: header, media, action row, likes, caption. */
const PostCard = ({ post }) => {
    const [liked, setLiked] = useState(post.liked)

    const { handle, name, avatar, verified } = post.author

    /* Optimistically reflect the viewer's own like in the count. */
    const likeCount = post.likes + (liked && !post.liked ? 1 : 0)

    return (
        <article className="flex flex-col">
            <header className="flex items-center gap-3 pb-3">
                <Avatar name={name} src={avatar} className="size-9" />
                <div className="flex min-w-0 flex-col leading-tight">
                    <div className="flex items-center gap-1">
                        <span className="truncate text-sm font-semibold">
                            {name}
                        </span>
                        {verified && (
                            <Icon size="xs" className="text-sky-500 [font-variation-settings:'FILL'_1]">
                                verified
                            </Icon>
                        )}
                        <span className="whitespace-nowrap text-sm text-muted-foreground">
                            • {post.timeAgo}
                        </span>
                    </div>
                    {post.group && (
                        <span className="truncate text-xs text-muted-foreground">
                            {post.group}
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

            {post.title && (
                <h2 className="pb-3 text-lg leading-none">{post.title}</h2>
            )}

            <div className="overflow-hidden rounded-lg bg-muted">
                <img
                    src={appPath(post.image)}
                    alt=""
                    className="h-auto w-full"
                />
            </div>

            <div className="flex items-center pt-4">
                <div className="flex items-center text-sm font-medium">
                    <button
                        type="button"
                        onClick={() => setLiked((v) => !v)}
                        aria-pressed={liked}
                        aria-label={liked ? "Unlike" : "Like"}
                        className="p-2 transition-transform active:scale-90"
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
                    {likeCount > 0 && (
                        <span className="tracking-tight tabular-nums">{formatCount(likeCount)}</span>
                    )}
                </div>
                <button
                    type="button"
                    aria-label="Comment"
                    className="flex items-center text-sm font-medium"
                >
                    <span className="p-2">
                        <CommentOutline className="size-6 text-foreground" />
                    </span>
                    {post.comments > 0 && (
                        <span className="tracking-tight tabular-nums">{formatCount(post.comments)}</span>
                    )}
                </button>
            </div>

            {post.likedBy && (
                <div className="flex items-center gap-2 pt-2 text-sm">
                    <Avatar name={post.likedBy} className="size-5" />
                    <span>
                        Liked by{" "}
                        <span className="font-semibold">{post.likedBy}</span>
                        {likeCount > 1 && (
                            <>
                                {" "}and{" "}
                                <span className="font-semibold">
                                    {(likeCount - 1).toLocaleString()} others
                                </span>
                            </>
                        )}
                    </span>
                </div>
            )}

            {post.body && (
                <Caption label={handle} text={post.body} />
            )}

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
