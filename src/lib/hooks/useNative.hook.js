"use client"

import { useEffect, useRef } from "react"
import { App as CapacitorApp } from "@capacitor/app"
import { Keyboard } from "@capacitor/keyboard"
import { SplashScreen } from "@capacitor/splash-screen"
import { StatusBar, Style } from "@capacitor/status-bar"

import { useTheme } from "@/lib/providers/Theme"
import { goBack, haptic, isNative, platform, pushBackHandler } from "@/lib/native"
import { usePushListeners } from "@/lib/store/push/hook"

/* The native shell's side effects, mounted once by App.jsx alongside the other app-wide
 * effects. Every one is a no-op in a browser, so the same tree runs in both places.
 * Background and rationale: .claude/skills/develop/native-architecture.md. */

/* ------------------------------------------------------------------------- */
/* Back gesture                                                              */
/* ------------------------------------------------------------------------- */

/* Lets a non-URL overlay (drawer, dialog, sheet) claim Android's back gesture while it is
 * open, so back dismisses it instead of navigating out from under it. Pass the same flag
 * that controls the surface's visibility.
 *
 * `onBack` is held in a ref so an inline arrow — the normal way to pass this — doesn't
 * re-register the handler on every render, which would reorder the stack and let back
 * close the wrong surface. */
export const useBackHandler = (active, onBack) => {
    const onBackRef = useRef(onBack)
    onBackRef.current = onBack

    useEffect(() => {
        if (!active) return
        return pushBackHandler(() => onBackRef.current?.())
    }, [active])
}

/* ------------------------------------------------------------------------- */
/* Shell bootstrap                                                           */
/* ------------------------------------------------------------------------- */

/* Keeps the status bar's icons legible against whatever the app is currently painting.
 * Style.Dark means *light* icons for a dark background, which is why it tracks
 * resolvedTheme (the concrete light/dark, after "system" is resolved) rather than `theme`. */
const useStatusBarTheme = () => {
    const { resolvedTheme } = useTheme()

    useEffect(() => {
        if (!isNative() || !resolvedTheme) return
        StatusBar.setStyle({
            style: resolvedTheme === "dark" ? Style.Dark : Style.Light,
        }).catch(() => {})
    }, [resolvedTheme])
}

/* Hides the launch splash once React has actually painted. The splash is configured with
 * `launchAutoHide: false` so it is dismissed here rather than on a timer: that way it
 * covers the whole cold boot — including the auth gate's redirect (see AuthGate) — and the
 * first thing the user sees is a settled screen rather than a flash of the wrong route.
 * Deferred a frame because an effect runs before the browser has committed the paint. */
const useSplashScreen = () => {
    useEffect(() => {
        if (!isNative()) return
        const frame = requestAnimationFrame(() => {
            SplashScreen.hide().catch(() => {})
        })
        return () => cancelAnimationFrame(frame)
    }, [])
}

/* Wires Android's hardware/gesture back button. It has no browser equivalent, so without
 * this the gesture closes the whole app from anywhere in it. The precedence (overlay →
 * history → exit-at-home) and the double-dispatch guard both live in `goBack`, which the
 * edge-swipe gesture shares. */
const useHardwareBack = () => {
    useEffect(() => {
        if (!isNative() || platform() !== "android") return

        const listener = CapacitorApp.addListener("backButton", () => goBack())

        return () => {
            listener.then((handle) => handle.remove()).catch(() => {})
        }
    }, [])
}

/* ------------------------------------------------------------------------- */
/* Edge-swipe back                                                           */
/* ------------------------------------------------------------------------- */

/* How close to the left edge a touch must begin to be a candidate. */
const EDGE_WIDTH = 28
/* Ignore the first few pixels so a tap or a near-vertical scroll isn't claimed as a swipe. */
const EDGE_SLOP = 10
/* Horizontal travel that commits the gesture on release. */
const COMMIT_DISTANCE = 72
/* …or a quick flick: this much travel at this speed (px/ms) also commits. */
const FLICK_DISTANCE = 24
const FLICK_VELOCITY = 0.5

/* The native "swipe from the left edge to go back" gesture, built by hand rather than left
 * to the platform — for the same reason usePullToRefresh is (see useScroll.hook.js). The app
 * navigates by `history.pushState` inside one WebView, and neither shell gives that back for
 * free: iOS' WKWebView back-swipe only tracks real page loads, not in-app history, and
 * Android's full-bleed WebView swallows the horizontal edge swipe before the system reads it
 * as a back gesture. So nothing here worked once the app moved off document scrolling onto a
 * fixed scroll container — this restores it identically on both platforms.
 *
 * Listeners hang off the window in the capture phase, not off any one node: the gesture has
 * to be caught over whatever is on top — the feed, an open post slide, a carousel — so it
 * can't live on the scroll container the way the pull gesture does. `touchmove` is non-passive
 * so it can preventDefault and take the drag away from the scroller or a horizontal carousel
 * the instant it's identified as an edge swipe; up to that point every touch is handed
 * straight back. A candidate is only a swipe if it starts within EDGE_WIDTH of the left edge
 * and then moves clearly rightward and more horizontally than vertically — so vertical
 * scrolling, taps, and mid-screen carousel swipes are all left alone.
 *
 * Native only. A mobile browser already has its own edge-swipe-back, and firing ours on top
 * would double-navigate; off-device there's no gesture surface at all. Commit routes through
 * `goBack`, the same debounced action the hardware back uses. */
const useEdgeSwipeBack = () => {
    useEffect(() => {
        if (!isNative()) return

        let startX = 0
        let startY = 0
        let startT = 0
        let dx = 0
        let tracking = false /* a touch began at the edge, direction not yet decided */
        let active = false /* committed to owning a rightward horizontal drag */

        const reset = () => {
            tracking = false
            active = false
            dx = 0
        }

        const onStart = (e) => {
            if (e.touches.length !== 1 || e.touches[0].clientX > EDGE_WIDTH) return
            startX = e.touches[0].clientX
            startY = e.touches[0].clientY
            startT = e.timeStamp
            tracking = true
            active = false
            dx = 0
        }

        const onMove = (e) => {
            if (!tracking) return
            dx = e.touches[0].clientX - startX
            const dy = e.touches[0].clientY - startY

            if (!active) {
                if (Math.abs(dx) < EDGE_SLOP && Math.abs(dy) < EDGE_SLOP) return
                /* Only a clear rightward, mostly-horizontal drag is ours; a leftward drag, a
                 * vertical scroll, or an ambiguous diagonal all go back to the browser. */
                if (dx <= 0 || Math.abs(dx) < Math.abs(dy)) {
                    reset()
                    return
                }
                active = true
            }

            /* Own the drag so the scroller/carousel underneath can't also move on it. */
            e.preventDefault()
        }

        const onEnd = (e) => {
            if (!tracking) return
            /* Snapshot the drag before reset() clears it — the commit test reads these. */
            const committed = active
            const travelled = dx
            const elapsed = e.timeStamp - startT
            reset()
            if (!committed) return

            const flick = travelled >= FLICK_DISTANCE && travelled / elapsed >= FLICK_VELOCITY
            if (travelled >= COMMIT_DISTANCE || flick) {
                /* A tap the instant the swipe commits, so the back registers in the hand the
                 * same way iOS' own edge-swipe does. Fired here rather than in goBack so it
                 * stays tied to the gesture and doesn't also buzz the hardware back button. */
                haptic()
                goBack()
            }
        }

        /* A cancelled sequence never commits. On Android an edge swipe the system claims as
         * its own back arrives here (it cancels the WebView's touch stream) — dropping it lets
         * the hardware `backButton` path own that case, so the two never double-fire. */
        const onCancel = () => reset()

        const opts = { capture: true, passive: false }
        window.addEventListener("touchstart", onStart, opts)
        window.addEventListener("touchmove", onMove, opts)
        window.addEventListener("touchend", onEnd, opts)
        window.addEventListener("touchcancel", onCancel, opts)
        return () => {
            window.removeEventListener("touchstart", onStart, opts)
            window.removeEventListener("touchmove", onMove, opts)
            window.removeEventListener("touchend", onEnd, opts)
            window.removeEventListener("touchcancel", onCancel, opts)
        }
    }, [])
}

/* Closes the on-screen keyboard when the field that opened it goes away — dismissing a
 * comment drawer mid-reply, say. The WebView otherwise keeps it up over a surface that no
 * longer has anything focused, since the native keyboard has no idea the element is gone. */
const useKeyboardDismiss = () => {
    useEffect(() => {
        if (!isNative()) return

        const onFocusOut = () => {
            if (!document.activeElement || document.activeElement === document.body) {
                Keyboard.hide().catch(() => {})
            }
        }

        window.addEventListener("focusout", onFocusOut)
        return () => window.removeEventListener("focusout", onFocusOut)
    }, [])
}

/* Mirrors the on-screen keyboard's height into the --keyboard-inset custom property, so any
 * surface pinned to the bottom edge can lift itself clear of the keyboard in CSS (see
 * globals.css for that token and the two derived from it).
 *
 * iOS only, and only because the plugin's own resize modes can't do this smoothly. `resize:
 * "native"` re-frames the WebView from a delayed selector — the keyboard's own animation
 * duration *plus* 200ms — so the composer snaps into place a beat after the keyboard has
 * already covered it, and every dvh in the app relayouts in that one frame. `resize: "none"`
 * in capacitor.config.json turns that off and hands us `keyboardWillShow`, which fires as
 * the animation *begins* and already carries the final height: set the inset there and a CSS
 * transition rides along with the keyboard instead of chasing it.
 *
 * Android is left alone — it resizes its own WebView as the keyboard opens (the `resize`
 * option is iOS-only), so the inset stays 0 and dvh-sized surfaces adapt on their own.
 *
 * **The web is not left alone, and it used to be.** The claim that "a browser shrinks its own
 * viewport" holds for Android Chrome and for a desktop browser, and is false on **iOS
 * Safari**: it shrinks only the *visual* viewport and leaves the layout viewport — and
 * therefore every `dvh` — at full height. So on mobile web at throughgrapevine.com the keyboard
 * covered anything pinned to the bottom, silently, while the same screen was correct in the
 * native app. `useVisualViewportInset` below fills that in. */
/* How long a keyboard has to stay gone before the layout believes it.
 *
 * A multi-step form unmounts the focused field and mounts the next one a beat later, and in
 * that gap nothing on the page is focused — so the keyboard begins to dismiss and every
 * surface sized against it lunges down, only to be shoved back up when the incoming step
 * autofocuses. The keyboard never really left; the layout should not act as though it did.
 *
 * Longer than the step cross-fade, so a swap produces no movement at all, and short enough
 * that a genuine dismissal still feels immediate. Growth is never delayed — a keyboard
 * appearing must reach the layout at once, since that is the direction that hides things. */
const KEYBOARD_SETTLE_MS = 320

/* Writes --keyboard-inset, applying growth immediately and collapse only once it has held.
 * Returns the writer plus a cancel for effect teardown. */
const insetWriter = () => {
    let timer = null

    const write = (px) =>
        document.documentElement.style.setProperty("--keyboard-inset", `${px}px`)

    const cancel = () => {
        if (timer) clearTimeout(timer)
        timer = null
    }

    const current = () =>
        parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue("--keyboard-inset"),
        ) || 0

    return {
        set: (px) => {
            cancel()
            if (px >= current()) return write(px)
            timer = setTimeout(() => write(px), KEYBOARD_SETTLE_MS)
        },
        cancel,
        write,
    }
}

const useKeyboardInset = () => {
    useEffect(() => {
        if (!isNative() || platform() !== "ios") return

        const inset = insetWriter()

        const shown = Keyboard.addListener("keyboardWillShow", ({ keyboardHeight }) =>
            inset.set(keyboardHeight),
        )
        const hidden = Keyboard.addListener("keyboardWillHide", () => inset.set(0))

        return () => {
            shown.then((handle) => handle.remove()).catch(() => {})
            hidden.then((handle) => handle.remove()).catch(() => {})
            inset.cancel()
            inset.write(0)
        }
    }, [])
}

/* The same inset, for the **web**, measured from `window.visualViewport`.
 *
 * The gap between the layout viewport and the visual one *is* the keyboard, and measuring it
 * this way is self-correcting across platforms rather than a per-browser special case:
 *
 *   iOS Safari      layout stays, visual shrinks  → the difference is the keyboard ✔
 *   Android Chrome  both shrink together          → difference ~0, and dvh already told the
 *                                                   truth, so nothing is double-counted ✔
 *   desktop         no keyboard, no difference    → 0 ✔
 *
 * Two guards, both for false positives that would shove the layout up with no keyboard on
 * screen. **Pinch-zoom** shrinks the visual viewport exactly like a keyboard does, so a
 * zoomed page is ignored. And a **threshold** absorbs the few dozen pixels iOS reclaims when
 * its URL bar collapses on scroll, which would otherwise read as a very short keyboard.
 *
 * Skipped entirely on native, where `useKeyboardInset` already owns the property from the
 * keyboard's own events — which are better, because they fire as the animation begins and
 * carry the final height, where this can only observe the result. */
const KEYBOARD_MIN_PX = 120

const useVisualViewportInset = () => {
    useEffect(() => {
        if (isNative()) return
        const viewport = window.visualViewport
        if (!viewport) return

        const inset = insetWriter()

        const measure = () => {
            if (viewport.scale > 1.01) return inset.set(0)

            const covered = window.innerHeight - (viewport.height + viewport.offsetTop)
            inset.set(covered > KEYBOARD_MIN_PX ? Math.round(covered) : 0)
        }

        measure()
        viewport.addEventListener("resize", measure)
        viewport.addEventListener("scroll", measure)

        return () => {
            viewport.removeEventListener("resize", measure)
            viewport.removeEventListener("scroll", measure)
            inset.cancel()
            inset.write(0)
        }
    }, [])
}

/* `ready` is a resolved, signed-in session — the condition for a tapped notification having
 * somewhere to open. Passed down rather than read here so the push listeners can be mounted
 * unconditionally: a cold launch delivers its tap before the session resolves, and a listener
 * attached after that never hears it. See usePushListeners. */
export const useNative = (ready) => {
    useStatusBarTheme()
    useSplashScreen()
    useHardwareBack()
    useEdgeSwipeBack()
    useKeyboardDismiss()
    usePushListeners(ready)
    /* Two halves of one job, and exactly one of them acts on any given platform: the native
     * keyboard events where they exist, the visual viewport everywhere else. */
    useKeyboardInset()
    useVisualViewportInset()
}

export default useNative

