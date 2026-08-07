"use client"

import { createContext, useCallback, useContext, useRef } from "react"

/* Shares the layout's scrollable container ref so any component can scroll it.
   The app scrolls inside a container in the layout (not the window), and the
   router has no <ScrollRestoration>, so navigating keeps the old scroll offset. */
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

/* Access the layout scroll container: { scrollRef, scrollToTop }.
   Attach `scrollRef` to the scrollable container; call `scrollToTop()` to scroll it. */
export const useScroll = () => useContext(ScrollContext)

export default ScrollProvider
