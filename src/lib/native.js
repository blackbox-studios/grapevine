import { App as CapacitorApp } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import { Haptics, ImpactStyle } from "@capacitor/haptics"

import { ROUTES } from "@/lib/constants"

/* Native-shell facts and the back-gesture registry. Plain module, no React — the hook that
 * drives it all is lib/hooks/useNative.hook.js. See native-architecture.md.
 *
 * Everything here is safe to call in a plain browser: `isNative()` is false there, and the
 * registry is inert because nothing dispatches to it. That is deliberate — components
 * register a back handler unconditionally rather than branching on the platform. */

/* True only inside the iOS/Android WebView. False in every browser, including a phone
 * browser — so never use it to detect "mobile", only "wrapped in the native app". */
export const isNative = () => Capacitor.isNativePlatform()

/* "ios" | "android" | "web". */
export const platform = () => Capacitor.getPlatform()

/* ------------------------------------------------------------------------- */
/* Foreground / background                                                   */
/* ------------------------------------------------------------------------- */

/* Subscribes to the shell moving between foreground and background, calling `handler(true)`
 * on resume and `handler(false)` on suspend. Returns an unsubscribe.
 *
 * The web has `visibilitychange` for roughly this, and it is what supabase-js uses — but a
 * WebView is not a tab, and Android in particular fires that event unevenly enough that the
 * session refresh cannot be hung off it. `appStateChange` is the platform telling us
 * directly, so it is what the auth store listens to. See `resume` in the auth store.
 *
 * A no-op returning a no-op off-device, so callers register unconditionally like every
 * other native affordance here. */
export const onAppState = (handler) => {
    if (!isNative()) return () => {}

    const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) =>
        handler(isActive),
    )

    return () => {
        listener.then((handle) => handle.remove()).catch(() => {})
    }
}

/* ------------------------------------------------------------------------- */
/* Haptics                                                                   */
/* ------------------------------------------------------------------------- */

/* A tactile tap for a confirmed user action — the like gesture uses it (on the like, not the
 * unlike), and the group switcher on every open and close. Fire-and-forget and safe to call
 * from anywhere (a store action, an event handler): it's a no-op off-device, so callers
 * never branch on the platform, and any plugin rejection (a device without a taptic engine,
 * an OS that declines) is swallowed rather than surfaced.
 *
 * Weight is named rather than passed as an `ImpactStyle`, so nothing outside this file has
 * to import a Capacitor symbol to ask for a softer tap. "medium" stays the default because
 * it is what every existing caller means: a deliberate, consequential action. "light" is for
 * chrome moving — a panel opening is worth confirming, but not with the same thump as
 * committing to something. */
const IMPACT = {
    light: ImpactStyle.Light,
    medium: ImpactStyle.Medium,
    heavy: ImpactStyle.Heavy,
}

export const haptic = (weight = "medium") => {
    if (!isNative()) return
    Haptics.impact({ style: IMPACT[weight] ?? ImpactStyle.Medium }).catch(() => {})
}

/* ------------------------------------------------------------------------- */
/* Back gesture                                                              */
/* ------------------------------------------------------------------------- */

/* Android's hardware/gesture back is a single global event, so something has to decide
 * what it means at any moment. Anything that owns the screen and is *not* a URL — a
 * drawer, a dialog, a sheet — pushes a handler while it's open, and back dismisses the
 * topmost one instead of navigating. A stack (not a single slot) because these nest: a
 * dialog opened from inside a drawer must close only itself, and closing it must hand
 * back to the drawer.
 *
 * URL-driven surfaces need no handler: a slide route is a real history entry, so back
 * unwinds it as navigation, which is what routes it to the right place already. */
const handlers = []

/* Registers a handler and returns its unregister. Splices by identity rather than popping
 * so an out-of-order release (React unmounting an outer surface first) can't drop the
 * wrong one. */
export const pushBackHandler = (handler) => {
    handlers.push(handler)
    return () => {
        const index = handlers.indexOf(handler)
        if (index !== -1) handlers.splice(index, 1)
    }
}

/* Runs the innermost open surface's dismiss, reporting whether it consumed the gesture. */
export const runBackHandler = () => {
    const handler = handlers[handlers.length - 1]
    if (!handler) return false
    handler()
    return true
}

/* The one back action for the whole native shell, shared by every way "back" can be asked
 * for: Android's hardware/gesture back (see useHardwareBack) and the left-edge swipe (see
 * useEdgeSwipeBack). Centralised so those two can't both act on the same physical gesture —
 * on Android a system edge swipe can surface as *both* a `backButton` event and the touch
 * stream the swipe hook watches — and so the precedence lives in exactly one place.
 *
 * Precedence, innermost first:
 *   1. An open non-URL overlay dismisses itself (a drawer/dialog/sheet's pushed handler).
 *   2. Anywhere that isn't home walks back through history — which is also what dismisses a
 *      slide route, since that is a real history entry.
 *   3. Back from home exits on Android (the platform convention); a no-op on iOS, which has
 *      no exit and whose history is already at the root.
 *
 * The debounce collapses a double-dispatch (both back sources firing for one gesture) into a
 * single action. The window is short enough that a deliberate rapid double-back still lands
 * its second press. */
const BACK_DEBOUNCE_MS = 350
let lastBackAt = 0

export const goBack = () => {
    const now = Date.now()
    if (now - lastBackAt < BACK_DEBOUNCE_MS) return
    lastBackAt = now

    if (runBackHandler()) return
    if (window.location.pathname === ROUTES.DEFAULT) {
        if (platform() === "android") CapacitorApp.exitApp()
        return
    }
    window.history.back()
}
