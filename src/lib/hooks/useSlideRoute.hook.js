"use client"

import { useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"

import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { appPath, slideRouteFor } from "@/lib/utils"

/* The other half of a slide route: how one is opened, and how the shell knows to draw it.
 *
 * A slide route must change the URL *without* changing the rendered route, because the
 * surface behind it has to stay mounted — that is the whole point (the feed keeps its
 * scroll offset, doesn't refetch, and can be pushed off-screen as a live element). Next
 * gives you exactly one primitive for "new URL, same route": `history.pushState`, which
 * the App Router treats as a URL sync and reflects through `usePathname` without touching
 * the segment tree. So opening a slide route is a pushState, and dismissing it is a
 * `history.back()`.
 *
 * This replaced an `@modal` intercepting route, which did the same job by asking Next to
 * hold the base route mounted. Interception is unavailable to us: `output: "export"` (the
 * native build — see native-architecture.md) rejects intercepting routes outright, and
 * the app ships as a static export. The shallow version is also the simpler one — it
 * needs no parallel slot, no `default.jsx`, and no interceptor page, and it retires the
 * slot-teardown trap those brought with them.
 *
 * The tradeoff to know about: while a slide route is open, the router's segment tree says
 * the app is on the base route while the URL says otherwise. Navigating away resolves it
 * (the next real navigation is computed from the tree, and lands correctly).
 *
 * `openedPath` is the full path the app itself opened, held module-level as transient view
 * state — not fetched data, so it stays out of the global ready/error lifecycle. Only one
 * slide route can be open at a time, so a single value is enough. Storing the *path*
 * rather than a flag is what makes dismissal self-clearing: once the URL moves anywhere
 * else, it no longer matches and the surface is closed, with nothing to reset. It is also
 * the soft- vs cold-load signal, which is why it can't be derived from the pathname alone:
 * a cold load of `/p/:id` (a shared link, opened in a browser) has a matching pathname but
 * no surface behind it, and must render the standalone page instead of an overlay. */
let openedPath = null
const listeners = new Set()

const publish = (path) => {
    if (openedPath === path) return
    openedPath = path
    listeners.forEach((listener) => listener())
}

const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

const useOpenedPath = () =>
    useSyncExternalStore(
        subscribe,
        () => openedPath,
        () => null,
    )

/* Opens a registered slide route. Call this instead of `router.push` for any path in the
 * SLIDE_ROUTES registry — a real navigation would unmount the surface underneath, which
 * is the one thing a slide route can't survive.
 *
 * Not a hook, so it can be called straight from an event handler. The push is recorded
 * before the URL changes so the shell resolves `open` on the same render that
 * `usePathname` reports the new path — otherwise the base would push a frame early,
 * before the surface had anything to be locked to. */
export const openSlide = (path) => {
    const route = slideRouteFor(path)
    if (!route) return
    publish(path)
    window.history.pushState(null, "", appPath(path))
}

/* Dismisses the open slide route by unwinding the entry `openSlide` pushed, so the
 * hardware/browser back gesture and the surface's own close button are the same action.
 * Returns false when there's no entry to unwind — a cold deep link, where the caller
 * should navigate to the base route instead (see PostView's dismiss). */
export const closeSlide = () => {
    if (openedPath === null) return false
    window.history.back()
    return true
}

/* Shell side. Resolves the slide route to show right now:
 *
 *   route  — the matched registry entry + its dynamic `param`
 *   open   — the surface should be on screen. True only when the current pathname is the
 *            exact path the app opened, which closes the surface the moment the URL moves
 *            (dismissal, or a tap on another nav tab) and keeps cold deep links out of
 *            the overlay so the standalone page can handle them.
 *   pushed — the base surface behind it should slide away. Desktop presents slide
 *            routes as a centered dialog over the base, so only mobile pushes. */
export const useActiveSlide = () => {
    const pathname = usePathname()
    const isDesktop = useIsDesktop()
    const opened = useOpenedPath()

    const route = slideRouteFor(pathname)
    const open = !!route && opened === pathname

    return { route, open, pushed: open && !isDesktop }
}
