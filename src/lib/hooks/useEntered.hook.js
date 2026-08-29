"use client"

import { useEffect, useState } from "react"

/* False for the first painted frame, true from the next one — an entrance for a subtree
 * under an `<AnimatePresence initial={false}>`, where Motion skips `initial` and only a
 * change of `animate` animates anything.
 *
 * **Not `useMounted`.** That answers "has hydration happened", which is already true on the
 * first render of anything mounted by client navigation — so an entrance keyed to it plays
 * on a reload of the page it sits on and is skipped everywhere else, native included, where
 * the packaged app boots the root document and navigates to the rest.
 *
 * The frame is what makes it an animation: an effect runs before the browser has committed
 * the paint, so flipping synchronously would leave nothing to travel from. */
export const useEntered = () => {
    const [entered, setEntered] = useState(false)

    useEffect(() => {
        const frame = requestAnimationFrame(() => setEntered(true))
        return () => cancelAnimationFrame(frame)
    }, [])

    return entered
}

export default useEntered
