"use client"

import { BackHeader } from "@/components/BackHeader"
import { CommentsPanel } from "@/components/Comments"
import { SlideSurface } from "@/components/SlideSurface"
import { Attachment, Close, Overlay } from "@/components/Widgets"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { appPath } from "@/lib/utils"

/* The post as the thread's opening block: the title as a headline, the body beneath it at
 * reading size, and the file if it carries one.
 *
 * **No author handle and no avatar**, unlike the caption this replaces — the author is already
 * named in the header a few pixels above, and prefixing the writing with a handle is what makes
 * a post read as a caption for something. There is nothing here for it to be captioning.
 *
 * `whitespace-pre-line` keeps the author's line breaks; see <Caption/> in components/Feed.jsx
 * for why every surface that renders a body carries it. */
const PostText = ({ post }) => (
    <div className="flex flex-col gap-3 px-4 pb-3">
        {post.title && (
            <h2 className="text-xl font-semibold leading-snug tracking-tight">
                {post.title}
            </h2>
        )}
        {post.body && (
            <p className="whitespace-pre-line wrap-break-word text-base">
                {post.body}
            </p>
        )}
        {post.document && (
            <Attachment {...post.document} href={appPath(post.document.url)} />
        )}
    </div>
)

/* The surface for a post with no photo (`/p/:id`) — the third presentation <PostView/> picks
 * between, and the reason it exists: the other two are built around media, so a text-only
 * announcement opened from a push notification or a shared link landed in a photo viewer with
 * no photo in it.
 *
 * **It is the writing, then the conversation, in one scroll** — the shape a text post takes
 * everywhere it appears, and the shape that made the media presentations' split (photo here,
 * comments there) worth abandoning rather than adapting. So there is no comment sheet to raise
 * on mobile and no rail to raise it from: the post is already the top of the thread.
 *
 * Which is why almost nothing is drawn here. <CommentsPanel/> is that whole column — the
 * author header, the scrolling thread, the like/comment row, the like tally and the composer —
 * and it already takes the block the thread opens with, so the post above the comments is one
 * prop rather than a second layout. What is left is the box, and the two boxes differ enough
 * (a centered dialog, a full-screen sheet) to be worth branching on but not worth two files:
 * <NotificationsView/> is the same small shape and the model for it. */
const PostTextView = ({ variant, post, dismiss }) => {
    const isDesktop = useIsDesktop()

    const thread = (
        <CommentsPanel
            post={post}
            dismiss={dismiss}
            caption={<PostText post={post} />}
            className="min-h-0 flex-1"
        />
    )

    if (isDesktop) {
        return (
            <Overlay dismiss={dismiss} close={false}>
                <div className="relative z-10">
                    {/* A fixed height rather than one the content sets: the thread arrives a
                        round trip after the post, and a dialog that resized as its skeleton
                        resolved would move under the reader's cursor. Narrow, because a column
                        of prose read at a photo dialog's width is not read. */}
                    <div className="flex h-[min(85dvh,42rem)] w-[min(92vw,32rem)] flex-col overflow-hidden rounded-2xl border bg-popover">
                        {thread}
                    </div>

                    {/* Beside the dialog rather than in the window's corner, which on a surface
                        this narrow is most of a screen away from it. Outside the box because
                        inside it the pill would land on the post's own menu, and there is always
                        room: the breakpoint below this presentation is 640px and the box is
                        512px, so the margin never falls under 64px. */}
                    <Close
                        onClick={dismiss}
                        aria-label="Close post"
                        className="absolute -right-12 top-0"
                    />
                </div>
            </Overlay>
        )
    }

    return (
        <SlideSurface variant={variant} className="bg-background">
            {/* A back arrow rather than the floating <Close/> pill, for the same reason
                /notifications carries one: this surface fills the screen and reads as a place.
                The post's own menu stays in the header below it, where <CommentsPanel/> already
                puts it, rather than being lifted into this bar and drawn twice.
                `pb-2` tightens the bar to the author row it introduces — the panel below brings
                its own top padding, and the bar's default assumes it is heading a page. */}
            <BackHeader title="Post" back={dismiss} className="pb-2" />

            {/* Pads its foot by the home-indicator inset, less whatever the surface has already
                been lifted by — the surface covers the mobile rail, which is what used to
                provide that clearance. On the wrapper rather than on the panel so the pad falls
                below the composer instead of inside it. */}
            <div className="flex min-h-0 flex-1 flex-col pb-[calc(var(--bottom-inset)-var(--keyboard-inset))]">
                {thread}
            </div>
        </SlideSurface>
    )
}

export default PostTextView
