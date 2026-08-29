"use client"

import { useEffect, useState } from "react"

/* False for the first painted frame, true from the next one — the trigger for an entrance
 * that cannot be expressed as Motion's `initial`.
 *
 * Under an `<AnimatePresence initial={false}>` Motion skips `initial` for the whole subtree,
 * so anything arriving inside one has to animate a change of `animate` instead. This is the
 * change.
 *
 * **Not `useMounted`.** That one answers "has hydration happened", which is already true on
 * the first render of anything mounted by client navigation — so an entrance keyed to it
 * plays on a reload of the page it sits on and is silently skipped everywhere else, native
 * included, since the packaged app boots the root document and navigates to the rest.
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
