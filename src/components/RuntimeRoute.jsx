"use client"

import { useState } from "react"

import ConversationView from "@/components/ConversationView"
import { MessagesList } from "@/components/Messages"
import NotificationsView from "@/components/NotificationsView"
import EventsView from "@/components/EventsView"
import PostView from "@/components/PostView"
import { ROUTES } from "@/lib/constants"
import { useRuntimePage } from "@/lib/hooks/useSlideRoute.hook"

/* What each registered runtime route draws — the one map from a route prefix to a surface.
 *
 * **This is the extraction point.** A runtime route is a URL whose dynamic segment could not
 * have been known when the bundle was built (a post id, a group id), reached by shallow
 * history navigation and resolved from the *pathname* rather than from a route segment — see
 * `RUNTIME_ROUTES` in constants.js for why the static export leaves no alternative. That
 * mechanism used to be welded to the sliding overlay that was its first consumer; it is not,
 * and this map is what both presentations now share.
 *
 * Adding a route is two lines: an entry in `RUNTIME_ROUTES` saying how it presents, and an
 * entry here saying what it renders. Nothing else in the shell has to change, and no page
 * file is created — which is exactly the property that keeps ids out of the build.
 *
 * A surface receives the route's dynamic `param` and the presentation it should take:
 *
 *   "modal"  in-app slide overlay, drawn by <SlideRouter/>
 *   "page"   a full surface — a cold-loaded slide route, or an ordinary page route
 *   "inline" an `inline` route above the breakpoint, drawn in the shell's page slot
 *
 * Slide surfaces own their own enter/exit animation (so it can differ by breakpoint) and
 * animate horizontally on SLIDE_TRANSITION to stay locked to the pushed base. A `slide: false`
 * surface animates nothing: <PageTransition/> cross-fades it like any other page. */
export const RUNTIME_SURFACES = {
    [ROUTES.POST]: (param, variant) => <PostView variant={variant} postId={param} />,
    [ROUTES.NOTIFICATIONS]: (param, variant) => <NotificationsView variant={variant} />,
    /* Three presentations, because a conversation is a different *kind* of thing at each
     * size. "modal" and "page" are the phone's sheet, opened in-app or cold-loaded.
     * "inline" is the desktop, where the thread is not a surface of its own at all — it is
     * the right half of the inbox, so the URL draws the inbox and <MessagesList/> reads the
     * id off the pathname. */
    [ROUTES.CONVERSATION]: (param, variant) =>
        variant === "inline" ? (
            <MessagesList />
        ) : (
            <ConversationView variant={variant} conversationId={param} />
        ),
    /* A page route, so it takes no `variant` — there is one presentation. It also takes no
     * `param`: `<EventsView/>` reads the pathname itself, which is what lets the *page* at
     * `/events` and this surface be the same component, so a rota reached by a link lands on
     * exactly the screen a rota reached by tapping one does. */
    [ROUTES.SIGNUP]: () => <EventsView />,
}

/* The shell's page slot: an ordinary (`slide: false`) runtime route if the URL names one,
 * otherwise whatever the router actually resolved.
 *
 * Mounted *inside* <PageTransition/> in `(protected)/layout.jsx`, which is what gives these
 * routes the same cross-fade every other page gets — `pageTransitionKey` resolves a page
 * runtime route to its own pathname (only slide routes collapse to their base), so arriving
 * at one is a key change and fades.
 *
 * **This is the piece that makes a runtime route feel like a page rather than an overlay.**
 * `pushRoute` changes the URL without changing the segment tree, so the router keeps whatever
 * page was already mounted as `children`; swapping it out here is what puts the new surface
 * on screen. It also means one component covers both arrivals — a tap from inside the app and
 * a cold load of the same URL render identically, because both are just "the pathname names a
 * runtime route".
 *
 * Slide routes are deliberately untouched *while they present as overlays*: they are drawn
 * over the page slot by <SlideRouter/>, and a cold load of one is handled by <SlidePage/>
 * from the catch-all. If this rendered them too they would appear twice, once in each place.
 * An `inline` route above the breakpoint is not presenting as an overlay — `<SlideRouter/>`
 * has no entry for it and its surface draws nothing at that size — so it resolves here
 * instead, which is the one case where a `slide: true` route reaches this slot. */
export const RuntimeRoute = ({ children }) => {
    /* **Resolved once, on mount, and deliberately never re-read.**
     *
     * This instance belongs to one keyed element inside <AnimatePresence mode="wait">, and
     * while that element is animating *out* it must keep rendering what it had. `usePathname`
     * would not let it: <FrozenRouter/> pins `LayoutRouterContext` for an exiting subtree but
     * the pathname lives in its own context and is not frozen, so a live read here returns the
     * route being navigated *to*.
     *
     * That is what made the page appear to flash twice. Arriving at `/g/:orgId` swapped the
     * outgoing page's content to group settings before its fade-out had played, so the surface
     * faded out and then faded straight back in — two flashes for one navigation. Latching
     * makes the exiting instance render the page it was mounted for and the entering instance
     * render the new one, which is one cross-fade.
     *
     * Safe because a page runtime route always changes `pageTransitionKey` — the key is the
     * pathname for anything `slideRouteFor` does not claim — so arriving at one always mounts
     * a fresh instance. There is no case where a mounted instance needs to notice a route it
     * did not start with. */
    const live = useRuntimePage()
    const [route] = useState(live)

    if (!route) return children

    const surface = RUNTIME_SURFACES[route.prefix]
    /* Registered as a route but given no surface — a half-finished addition. Falling through
     * to the router's own answer means the catch-all's 404, which is the honest result. */
    if (!surface) return children

    /* `useRuntimePage` hands back an `inline` route only above the breakpoint, so the flag
     * being here is already the answer to "which size is this". */
    return surface(route.param, route.inline ? "inline" : "page")
}

export default RuntimeRoute
