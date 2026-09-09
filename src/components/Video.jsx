"use client"

import { useState } from "react"

import Img from "@/components/Img"
import { platform } from "@/lib/native"
import { cn, youtubeEmbedPageUrl, youtubeEmbedUrl, youtubeThumbnail } from "@/lib/utils"

/* A YouTube video on a post.
 *
 * **The still is the component, and the player is what a tap replaces it with.** A feed is a
 * column of cards, and an iframe per card is a megabyte of somebody else's JavaScript per card,
 * running before anybody has said they want to watch anything — on a page whose whole job is to
 * be scrolled past. So what a card holds is one image and a button, and the player is mounted
 * by the press that asks for it. This is the standard facade, and here it is also the privacy
 * measure: nothing is requested from YouTube — no cookie, no script, no request at all — until
 * somebody asks to watch, which is more than the `youtube-nocookie.com` domain offered, since
 * that one still loaded the player for every reader who scrolled past. See `youtubeEmbedUrl`
 * for why the player is not on that domain.
 *
 * It follows that the press is the play: the embed carries `autoplay=1`, because a player that
 * arrived stopped under a finger that has already pressed play is asking the same question
 * twice.
 *
 * **The box is 16:9 and comes from the kind, not from the data.** YouTube letterboxes whatever
 * was filmed into that shape, so unlike a photo there is nothing to reserve the box *from* and
 * nothing to learn by asking — which is why a video row carries no `width`/`height` at all. */

/* YouTube's own badge, drawn rather than imported: it is two paths, and it is the one mark that
 * says where the tap leads before it is taken. An SVG rather than a styled box with a
 * border-triangle inside it — the shape is then one element that cannot be squeezed out of
 * proportion by whatever it is centered in, and it scales to any height by itself. */
const PlayBadge = () => (
    <svg
        viewBox="0 0 68 48"
        aria-hidden="true"
        className="h-10 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
    >
        <path
            className="fill-[#212121]/80 transition-colors group-hover:fill-[#f00]"
            d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.79 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z"
        />
        <path className="fill-white" d="M45 24 27 14v20z" />
    </svg>
)

/* The still, at the best resolution that exists for this video.
 *
 * `maxresdefault` is only generated for uploads that were HD, and a parish's 2014 liturgy
 * recording is often not — so the request that 404s is made first and `hqdefault`, which every
 * video has, catches it. The other way round would mean every poster in the feed being drawn
 * twice, and the fallback is the rarer case.
 *
 * Both stills are 4:3 with the frame letterboxed inside, so `object-cover` in a 16:9 box crops
 * the bars back off exactly rather than showing them as part of the card. */
const Poster = ({ id, alt }) => {
    const [max, setMax] = useState(true)

    return (
        <Img
            src={youtubeThumbnail(id, { max })}
            onError={() => setMax(false)}
            alt={alt}
            /* Absolute, so the badge centered over it is the only thing in the button's flow.
             * As a flex item the poster shrinks by exactly the badge's width, which takes the
             * box off 16:9 and leaves `object-cover` with the still's own letterbox to show. */
            className="absolute inset-0 size-full object-cover"
        />
    )
}

const Video = ({ video, className }) => {
    const [playing, setPlaying] = useState(false)

    if (!video?.id) return null

    return (
        <div className={cn("relative aspect-video w-full overflow-hidden bg-black", className)}>
            {playing ? (
                <iframe
                    /* iOS loads the player through a page on our own domain, because its
                     * WebView origin is `capacitor://localhost` and YouTube refuses a
                     * non-http(s) embedder with error 153. Nowhere else needs the hop: a
                     * browser is already on a real origin, and Android's WebView serves the
                     * app over https. See `youtubeEmbedPageUrl`. */
                    src={
                        platform() === "ios"
                            ? youtubeEmbedPageUrl(video.id)
                            : youtubeEmbedUrl(video.id)
                    }
                    title="YouTube video player"
                    /* What the player asks for. `fullscreen` is granted here as well as by the
                     * attribute below, because the button inside the frame goes through the
                     * permission policy rather than through `allowfullscreen`. */
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                    className="absolute inset-0 size-full border-0"
                />
            ) : (
                <button
                    type="button"
                    onClick={() => setPlaying(true)}
                    aria-label="Play video"
                    className="group absolute inset-0 flex cursor-pointer items-center justify-center"
                >
                    {/* Empty alt: the still is the video, and the post's own title and body are
                      * what say what it is. A generated description of a frame is worse than
                      * the button's label beside it. */}
                    <Poster id={video.id} alt="" />
                    {/* Over the still, and dimmed behind the badge so a white or a busy frame
                      * cannot swallow it. */}
                    <span className="absolute inset-0" />
                    <span className="relative"><PlayBadge /></span>
                </button>
            )}
        </div>
    )
}

export default Video
