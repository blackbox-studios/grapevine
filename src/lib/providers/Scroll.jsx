"use client"

import { createContext, useCallback, useContext, useRef } from "react"

/* Shares the shell's scroll container with the whole app. The app scrolls a fixed,
   viewport-height container in the protected layout (not the document itself), so every
   scroll read or action has to target *that* node rather than the window: `scrollRef` is
   attached to the container, `scrollToTop` scrolls it, and useVibing / usePullToRefresh
   read it (see useScroll.hook.js).

   A synthetic container rather than the document is the model the shell is built on: an
   overlay that covers the screen (a slide route, a dialog, a drawer) is a separate fixed
   layer, so the container behind it simply can't be reached and scrolled — which is why
   overlays no longer lock anything. */
const ScrollContext = createContext(null)

export const ScrollProvider = ({ children }) => {
    const scrollRef = useRef(null)

    const scrollToTop = useCallback((options = {}) => {
        const node = scrollRef.current ?? document.scrollingElement
        node?.scrollTo({ top: 0, ...options })
    }, [])

    return (
        <ScrollContext.Provider value={{ scrollRef, scrollToTop }}>
            {children}
        </ScrollContext.Provider>
    )
}

/* Access the shell scroll container: { scrollRef, scrollToTop }. Attach `scrollRef` to
   the scrollable container; call `scrollToTop()` to scroll it. */
export const useScroll = () => useContext(ScrollContext)

export default ScrollProvider
