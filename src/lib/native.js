import { Capacitor } from "@capacitor/core"

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
