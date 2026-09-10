"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { usePathname, useRouter } from "next/navigation"

import { ROUTES } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { appPath, baseRouteFor, basePath, runtimeRouteFor, slideRouteFor } from "@/lib/utils"

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
 * and the registry does not, so a subpath deployment would otherwise never match. */
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

/* **The primitive: change the URL without changing the rendered route.**
 *
 * This is the whole mechanism that lets a route carry an id nobody knew at build time.
 * `history.pushState` is the only thing Next gives you for "new URL, same route" — the App
 * Router treats it as a URL sync and reflects it through `usePathname()` without touching the
 * segment tree — so no dynamic segment has to exist, and `generateStaticParams` has nothing
 * to enumerate under `output: "export"`. It is also why the hardware/browser back gesture
 * unwinds one of these for free: it is a real history entry.
 *
 * Use it for **any** route in RUNTIME_ROUTES, whichever presentation it declares. A slide
 * route wraps it in `openSlide` to also record the stack entry its overlay needs; an ordinary
 * page route (group settings) calls this directly and is drawn by <RuntimeRoute/> in the
 * shell's page slot, where <PageTransition/> cross-fades it like any other page.
 *
 * `router.push` is not an alternative here and never becomes one. In the export there is no
 * route to push to — the id was never enumerated — so the client router has nothing to
 * resolve; and for a slide route it would additionally unmount the surface underneath, which
 * is the one thing a slide route cannot survive.
 *
 * Not a hook, so it can be called straight from an event handler. */
export const pushRoute = (path) => {
    if (!runtimeRouteFor(path)) return false
    window.history.pushState(null, "", appPath(path))
    return true
}

/* Opens a registered slide route. Call this instead of `router.push` for any path in the
 * RUNTIME_ROUTES registry — a real navigation would unmount the surface underneath, which
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

/* The **page**-presentation runtime route the shell should draw right now, or null.
 *
 * Read by <RuntimeRoute/> in the page slot. A route presents as a page here in two cases,
 * and they are the same case: `slide: false`, which is always a page, and an `inline` route
 * above the breakpoint, which is a page at that size. An overlay must never resolve here as
 * well, or it appears twice — once portalled over the shell and once inside it.
 *
 * The `inline` arm is what makes `pushRoute` enough for those routes. `pushRoute` changes
 * the URL without touching the segment tree, so the router keeps whatever page it already
 * had as `children`; without a resolver that claims the pathname, opening a conversation
 * from anywhere but the inbox would change the URL and draw nothing.
 *
 * A page runtime route is never recorded in `openedStack`, and that is load-bearing rather
 * than an omission — the stack is what `useActiveSlide` reports as `open`, which pushes the
 * base container off-screen. A settings page that registered itself there would shove the
 * shell sideways on the way in. */
export const useRuntimePage = () => {
    const pathname = usePathname()
    const overlaying = useOverlaying(pathname)
    const route = runtimeRouteFor(pathname)
    return route && !overlaying ? route : null
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

/* **Is the pathname presenting as an overlay right now?** The one question three separate
 * pieces of the shell have to agree on, which is why it is one function rather than three
 * copies of the same conjunction.
 *
 * A `slide: true` route is normally an overlay. An `inline` one above the `md` breakpoint is
 * not: it is a selection inside a page that has room to hold it, so it navigates, draws in
 * the page slot, and lets the shell follow it like any other route. Answering this question
 * differently in any one of the three places is the shape of the bug — a URL that changes
 * with nothing rendered behind it, a nav rail lit on the wrong tab, or a page frozen under a
 * surface that was never drawn over it. */
const useOverlaying = (pathname) => {
    const isDesktop = useIsDesktop()
    const route = slideRouteFor(pathname)
    return Boolean(route) && !(isDesktop && route.inline)
}

/* Opens a runtime route the way *that* route presents, which is not always the same way.
 *
 * A slide route is normally `openSlide`: it records the path on the overlay stack, which is
 * what draws the surface and pushes the base aside. An `inline` route above the breakpoint
 * is not an overlay at all — it is a selection inside a page — so it takes `pushRoute`, and
 * `useRuntimePage` claims the pathname for the shell's page slot.
 *
 * **Every entrance to such a route goes through here**, including the ones that arrive from
 * outside the surface: a tapped push banner and the Message button on a profile card can
 * both fire from anywhere in the app, where the base page is not on screen to be selected
 * inside.
 *
 * **Using `openSlide` for one anyway is not merely redundant.** The stack would gain an entry
 * per tap for a surface that draws nothing, so switching between two conversations pushes the
 * same path twice and <SlideRouter/> renders two children with one key; and `useActiveSlide`
 * would report `open`, which is exactly what <SlidePage/> checks before handling a cold load.
 *
 * Not a hook out of preference — it needs the breakpoint, which is one. */
export const useRouteOpener = () => {
    const isDesktop = useIsDesktop()

    return useCallback(
        (path) => {
            const route = runtimeRouteFor(path)
            const overlay = Boolean(route?.slide) && !(isDesktop && route.inline)
            return overlay ? openSlide(path) : pushRoute(path)
        },
        [isDesktop],
    )
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

/* The route the shell should behave as if it is on, which is not always the one in the URL.
 *
 * A slide route changes the URL without changing the rendered route, so while one is open the
 * pathname names the overlay and the page slot still holds the page underneath. Anything that
 * asks "where are we" off the raw pathname therefore gets the overlay's answer for a page that
 * is still on screen — which lights the wrong nav tab, and, because the shell keys its
 * cross-fade on it, fades that page out and back in *behind* the overlay and scrolls it to the
 * top on the way.
 *
 * **The page underneath is wherever the reader was, not the registry's `base`.** A post opened
 * from the daily reading sits over the daily reading; `base` is the *cold* answer — where a
 * shared link has to dismiss to, since nothing is mounted behind it — and using it for a
 * surface this session opened is what made the overlay claim to be over the feed from every
 * other page in the app. So the last non-slide pathname is held, and that is what the shell
 * reads.
 *
 * Derived during render rather than in an effect, so the held value is right on the frame the
 * pathname changes; an effect would let one frame paint on the overlay's answer, which is the
 * flash this exists to prevent. It initialises through `baseRouteFor`, which is what makes a
 * cold deep link resolve to the registry base with no branch of its own. */
export const useShellRoute = () => {
    const pathname = usePathname()
    const overlaying = useOverlaying(pathname)
    const [route, setRoute] = useState(() => baseRouteFor(pathname))

    if (!overlaying && route !== pathname) setRoute(pathname)

    return route
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
 * RUNTIME_ROUTES, so resolving it here is what keeps a new slide route from having to restate
 * its own base at its call site. */
export const useSlideDismiss = () => {
    const pathname = usePathname()
    const router = useRouter()

    const base = slideRouteFor(pathname)?.base ?? ROUTES.DEFAULT

    const dismiss = useCallback(() => {
        if (!closeSlide()) router.push(base)
    }, [router, base])

    /* **One dismissal per keypress, however many surfaces are stacked.** Every mounted surface
     * calls this hook, and with a post opened over the notifications panel both are mounted —
     * so both listeners see the same Escape and, unguarded, `history.back()` runs twice and
     * takes the panel down with the post. Marking the event handled is what settles it: the
     * listeners share one event object, so the first to run claims it and the rest fall
     * through. Which one runs first does not matter, because they all do the same thing —
     * `closeSlide` unwinds the topmost entry no matter who asked. */
    useEffect(() => {
        const onKey = (event) => {
            if (event.key !== "Escape" || event.defaultPrevented) return
            event.preventDefault()
            dismiss()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [dismiss])

    return dismiss
}
