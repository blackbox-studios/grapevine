"use client"

import { useEffect, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"

import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { slideRouteFor } from "@/lib/utils"

/* The bridge between an intercepting slide route and the shell that renders it.
 *
 * Why it exists: Next tears a parallel-route slot's subtree down the instant the
 * route changes, so a surface rendered *inside* the `@modal` slot can never play an
 * exit animation — it's gone before AnimatePresence can retain it. So the interceptor
 * renders nothing and only reports "I'm mounted"; the shell owns the actual surface
 * (see <SlideRouter/>). Because that instance lives in the persistent layout, it
 * survives the slot teardown and animates out cleanly.
 *
 * The interceptor mounting is also the only reliable soft- vs hard-nav signal: on a
 * hard load / refresh the slot falls back to default.js and never mounts, so the
 * shell renders no overlay and the plain page route handles the deep link instead.
 *
 * This is a minimal module-level store read via useSyncExternalStore — transient view
 * state, not fetched data, so it stays out of the global ready/error lifecycle. Only
 * one slide route can be open at a time, so a single value is enough. */
let interceptedPrefix = null
const listeners = new Set()

const publish = (prefix) => {
    if (interceptedPrefix === prefix) return
    interceptedPrefix = prefix
    listeners.forEach((listener) => listener())
}

const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

const useInterceptedPrefix = () =>
    useSyncExternalStore(
        subscribe,
        () => interceptedPrefix,
        () => null,
    )

/* Interceptor side. The one line an intercepting page needs: declare which registered
 * slide route it stands in for. Renders nothing itself — see the `@modal` pages. */
export const useSlideRoute = (prefix) => {
    useEffect(() => {
        publish(prefix)
        return () => {
            /* Guarded so a newly-mounted interceptor isn't cleared by the outgoing
             * one's cleanup if React overlaps them. */
            if (interceptedPrefix === prefix) publish(null)
        }
    }, [prefix])
}

/* Shell side. Resolves the slide route to show right now:
 *
 *   route  — the matched registry entry + its dynamic `param`
 *   open   — the surface should be on screen. Requires *both* a matching pathname and
 *            a mounted interceptor: the pathname gate closes the overlay the moment you
 *            navigate elsewhere (a parallel slot is not reset by a soft nav to a
 *            non-matching route, so the interceptor can linger with a stale prefix),
 *            while the interceptor gate keeps hard-nav deep links out of the overlay.
 *   pushed — the base surface behind it should slide away. Desktop presents slide
 *            routes as a centered dialog over the base, so only mobile pushes. */
export const useActiveSlide = () => {
    const pathname = usePathname()
    const isDesktop = useIsDesktop()
    const intercepted = useInterceptedPrefix()

    const route = slideRouteFor(pathname)
    const open = !!route && route.prefix === intercepted

    return { route, open, pushed: open && !isDesktop }
}
