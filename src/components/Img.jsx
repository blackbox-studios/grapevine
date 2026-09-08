"use client"

import { useCallback, useState } from "react"

import { cn } from "@/lib/utils"

/* A photo that arrives rather than appears.
 *
 * A decoded image is painted by the browser the instant it is ready, which on a feed of
 * parish photographs reads as a flash: the box is already the right size (the media carries
 * its own width and height), so what lands is a rectangle of colour with no motion in front
 * of it. A short fade is enough to make that a delivery, and it costs nothing anywhere else
 * in the app because the element is an `<img>` in every other respect.
 *
 * **An image already in the cache is drawn at full opacity with no transition at all.** The
 * ref runs during the commit that inserts the element, and `complete` is the browser's own
 * answer to "is this already decoded" — so the same photo tapped from the feed into the open
 * post is up on the first frame, where fading it again would be an animation about nothing.
 * `naturalWidth` guards the other thing `complete` reports: a load that failed.
 *
 * A failure is shown rather than held back, since the alt text and the browser's own broken
 * glyph are what a reader has left at that point. */
const Img = ({ className, onLoad, onError, ...props }) => {
    const [state, setState] = useState("pending")

    const mount = useCallback((node) => {
        if (node?.complete && node.naturalWidth > 0) setState("ready")
    }, [])

    return (
        <img
            ref={mount}
            onLoad={(event) => {
                setState(current => (current === "pending" ? "fading" : current))
                onLoad?.(event)
            }}
            onError={(event) => {
                setState("ready")
                onError?.(event)
            }}
            className={cn(
                state === "pending" ? "opacity-0" : "opacity-100",
                state === "fading" && "transition-opacity duration-300 ease-out",
                className,
            )}
            {...props}
        />
    )
}

export default Img
