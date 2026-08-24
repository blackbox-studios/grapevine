"use client"

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react"
import { usePathname, useRouter } from "next/navigation"

import { ROUTES } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { appPath, basePath, slideRouteFor } from "@/lib/utils"

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
 * `openedStack` is the list of paths the app itself has opened, oldest first, held
 * module-level as transient view state — not fetched data, so it stays out of the global
 * ready/error lifecycle. Storing *paths* rather than a flag is what makes dismissal
 * self-clearing: once the URL moves anywhere else no entry matches, the surfaces close, and
 * there is nothing to reset. It is also the soft- vs cold-load signal, which is why it
 * cannot be derived from the pathname alone: a cold load of `/p/:id` (a shared link, opened
 * in a browser) has a matching pathname but nothing mounted behind it, and must render the
 * standalone page instead of an overlay.
 *
 * **A stack rather than a single path, because a slide route can be opened from inside
 * another one.** A notification opens the post it is about, and the post has to sit *over*
 * the notifications panel — dismissing it should reveal the list again, not the feed. A
 * single value could not express that: it had to be overwritten to open the second surface,
 * and going back then landed on a URL the shell no longer recognised as open, showing the
 * base route under a pathname that claimed otherwise.
 *
 * **What is open is derived, never mutated on navigation.** `activeSlides` truncates the
 * stack at the current pathname, so a back gesture uncovers the surface below with no
 * listener, no popstate handler, and no ordering hazard — the URL is the source of truth and
 * the stack is only the record of what this session opened. The one place that has to prune
 * is `openSlide`, which appends: it drops anything above the current path first, so opening
 * a second post after backing out of the first cannot resurrect the first. */
let openedStack = []
const listeners = new Set()

/* A stable empty array. `useSyncExternalStore` compares snapshots by identity, so returning
 * a fresh `[]` from either snapshot function would re-render forever. */
const EMPTY = []

const publish = (next) => {
    openedStack = next
    listeners.forEach((listener) => listener())
}

const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

const useOpenedStack = () =>
    useSyncExternalStore(
        subscribe,
        () => openedStack,
        () => EMPTY,
    )

/* The current pathname as the registries spell it — `window.location` carries the base path
 * and `SLIDE_ROUTES` does not, so a subpath deployment would otherwise never match. */
const currentPath = () => {
    const base = basePath()
    const path = window.location.pathname
    if (!base || !path.startsWith(base)) return path
    return path.slice(base.length) || "/"
}

/* The surfaces that should be on screen right now, outermost first, resolved against their
 * registry entries.
 *
 * The current pathname is the top of the stack by definition, so everything the app opened
 * *after* it belongs to a forward history entry the reader has since left — sliced off here
 * rather than deleted, because a browser forward gesture legitimately returns to it. A
 * pathname that is in the stack nowhere means the URL has moved off the slide routes
 * entirely (a nav tab, a dismissal), which closes all of them. */
const activeSlides = (stack, pathname) => {
    const top = stack.lastIndexOf(pathname)
    if (top === -1) return EMPTY
    return stack.slice(0, top + 1).map((path) => ({ path, ...slideRouteFor(path) }))
}

/* Opens a registered slide route. Call this instead of `router.push` for any path in the
 * SLIDE_ROUTES registry — a real navigation would unmount the surface underneath, which
 * is the one thing a slide route can't survive.
 *
 * Not a hook, so it can be called straight from an event handler. The push is recorded
 * before the URL changes so the shell resolves `open` on the same render that
 * `usePathname` reports the new path — otherwise the base would push a frame early,
 * before the surface had anything to be locked to.
 *
 * Called with a slide route already open, this **stacks**: the new surface covers the one
 * that opened it, and dismissing uncovers it. Anything above the current path is dropped
 * first, so backing out of one post and opening another cannot leave the first in the
 * stack — see the note on `activeSlides`. */
export const openSlide = (path) => {
    const route = slideRouteFor(path)
    if (!route) return

    const top = openedStack.lastIndexOf(currentPath())
    publish([...(top === -1 ? [] : openedStack.slice(0, top + 1)), path])
    window.history.pushState(null, "", appPath(path))
}

/* Dismisses the topmost slide route by unwinding the entry `openSlide` pushed, so the
 * hardware/browser back gesture and the surface's own close button are the same action.
 * With surfaces stacked this reveals the one underneath rather than the base route.
 *
 * Returns false when there's no entry to unwind — a cold deep link, where the caller should
 * navigate to the base route instead (see `useSlideDismiss`). */
export const closeSlide = () => {
    if (openedStack.length === 0) return false
    window.history.back()
    return true
}

/* Shell side. Resolves what should be on screen right now:
 *
 *   slides — every open surface, outermost first, each with its registry entry, its dynamic
 *            `param`, and the `path` it was opened at. Usually one; more when a slide route
 *            was opened from inside another.
 *   route  — the registry entry for the *topmost* surface, i.e. the one the URL names.
 *   open   — anything is on screen at all. False for a cold deep link, whose pathname
 *            matches a slide route but which this session never opened, so the standalone
 *            page handles it.
 *   pushed — the base surface behind should slide away. It travels a full viewport whatever
 *            the stack depth, since one surface already covers it. Desktop presents slide
 *            routes as a centered dialog over a still base, so only mobile pushes. */
export const useActiveSlide = () => {
    const pathname = usePathname()
    const isDesktop = useIsDesktop()
    const stack = useOpenedStack()

    const slides = useMemo(() => activeSlides(stack, pathname), [stack, pathname])
    const open = slides.length > 0

    return { slides, route: slideRouteFor(pathname), open, pushed: open && !isDesktop }
}

/* How every slide-route surface gets closed, and the Escape key that does it.
 *
 * Both halves are the same for any surface, so neither belongs in one: dismissal is
 * unwinding the history entry `openSlide` pushed, which makes the close button, Escape, and
 * the hardware/browser back gesture one action rather than three implementations of it.
 *
 * The fallback matters and is why this reads the registry rather than taking a route.
 * `closeSlide` returns false when there is nothing to unwind — a cold deep link, opened from
 * a shared URL or a refresh, which has no entry of its own — and the way out of that is a
 * real navigation to the surface the route overlays. That surface is recorded as `base` in
 * SLIDE_ROUTES, so resolving it here is what keeps a new slide route from having to restate
 * its own base at its call site. */
export const useSlideDismiss = () => {
    const pathname = usePathname()
    const router = useRouter()

    const base = slideRouteFor(pathname)?.base ?? ROUTES.DEFAULT

    const dismiss = useCallback(() => {
        if (!closeSlide()) router.push(base)
    }, [router, base])

    useEffect(() => {
        const onKey = (event) => {
            if (event.key === "Escape") dismiss()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [dismiss])

    return dismiss
}
