"use client"

import { useEffect, useRef } from "react"
import { App as CapacitorApp } from "@capacitor/app"
import { Keyboard, KeyboardResize } from "@capacitor/keyboard"
import { SplashScreen } from "@capacitor/splash-screen"
import { StatusBar, Style } from "@capacitor/status-bar"

import { useTheme } from "@/lib/providers/Theme"
import { ROUTES } from "@/lib/constants"
import { isNative, platform, pushBackHandler, runBackHandler } from "@/lib/native"

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
 * this the gesture closes the whole app from anywhere in it.
 *
 * Precedence, innermost first:
 *   1. An open non-URL overlay dismisses itself (see useBackHandler).
 *   2. Anywhere that isn't home walks back through history — which is also what dismisses
 *      a slide route, since that is a real history entry.
 *   3. Back from home exits, the convention on Android.
 *
 * Home is the exit test rather than `history.length`, which cannot tell "nothing before
 * this" from "we already walked back to the start" and so strands the user on a back press
 * that appears to do nothing. */
const useHardwareBack = () => {
    useEffect(() => {
        if (!isNative() || platform() !== "android") return

        const listener = CapacitorApp.addListener("backButton", () => {
            if (runBackHandler()) return
            if (window.location.pathname === ROUTES.DEFAULT) {
                CapacitorApp.exitApp()
                return
            }
            window.history.back()
        })

        return () => {
            listener.then((handle) => handle.remove()).catch(() => {})
        }
    }, [])
}

/* Closes the on-screen keyboard when the field that opened it goes away — dismissing a
 * comment drawer mid-reply, say. The WebView otherwise keeps it up over a surface that no
 * longer has anything focused, since the native keyboard has no idea the element is gone.
 *
 * The check is deferred a frame, and that is load-bearing. Focusing a field inside a focus
 * scope (the Vaul comment drawer) fires `focusout` for the element that held the scope's
 * focus *before* the tapped input receives it, and in that gap `document.activeElement` is
 * transiently `<body>`. Reading it synchronously sees "nothing focused" and hides the
 * keyboard the instant it is opening — in the Safari log that lands as a `Keyboard.hide`
 * immediately after `keyboardWillShow`, which is the flicker on screen. A frame later focus
 * has settled on the input, so we only hide once it has genuinely left every field. */
const useKeyboardDismiss = () => {
    useEffect(() => {
        if (!isNative()) return

        let frame = 0
        const onFocusOut = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
                const el = document.activeElement
                if (!el || el === document.body) Keyboard.hide().catch(() => {})
            })
        }

        window.addEventListener("focusout", onFocusOut)
        return () => {
            cancelAnimationFrame(frame)
            window.removeEventListener("focusout", onFocusOut)
        }
    }, [])
}

/* Publishes the keyboard's height as `--keyboard-inset` on <html> and takes iOS off its own
 * keyboard handling while a surface is using it. Use it through <KeyboardInset/>, which
 * spends the measurement; this is the native half.
 *
 * The default is unusable here, from measuring a focus in the comment drawer (iPhone,
 * keyboard 345px): `resize: "native"` does resize the WebView, but ~800ms after focus, long
 * after the keyboard has finished sliding up — so the sheet is reflowed out from under a
 * keyboard that already arrived, which is the lurch on screen. `visualViewport.height` only
 * ever mirrors innerHeight, so nothing sees the keyboard any earlier — which is also why
 * Vaul's own keyboard handling can't help us.
 *
 * `keyboardWillShow` *is* punctual and carries the height, so that is what we drive
 * instead, with the WebView pinned at full height (`resize: "none"`) so nothing reflows.
 * `setScroll` then stops WKWebView dragging its own scroll view up to reveal the focused
 * field: that is a native scroll, out of reach of any page-level freeze — measured going to
 * scrollY 410 with <body> already pinned.
 *
 * useScrollLock's pin is what makes disabling that scroll safe, so surfaces using this must
 * hold one. Alone it is destructive: it clamps the WebView to offset 0, so focusing a
 * composer partway down a scrolled feed snaps you to the top. The pin has already parked
 * that offset on <body>'s `top`, leaving a scroll position of 0 to clamp *to*.
 *
 * Both settings are restored on close, so the rest of the app keeps the native lift. They
 * are ref-counted at module scope, so surfaces can nest (the drawer over the post view)
 * without one's teardown restoring them while the other is still open.
 *
 * iOS-only: Android's keyboard fires only `keyboardDidShow`/`Hide` — after the fact, so
 * there is nothing to sync to — and its native resize was never the janky one. */
let keyboardScopes = 0

export const useKeyboardInset = (active) => {
    useEffect(() => {
        if (!active || !isNative() || platform() !== "ios") return

        const root = document.documentElement
        const setInset = (px) => root.style.setProperty("--keyboard-inset", `${px}px`)

        if (keyboardScopes++ === 0) {
            Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => {})
            Keyboard.setScroll({ isDisabled: true }).catch(() => {})
        }

        const show = Keyboard.addListener("keyboardWillShow", (info) =>
            setInset(info.keyboardHeight),
        )
        const hide = Keyboard.addListener("keyboardWillHide", () => setInset(0))

        return () => {
            show.then((handle) => handle.remove()).catch(() => {})
            hide.then((handle) => handle.remove()).catch(() => {})
            if (--keyboardScopes === 0) {
                setInset(0)
                Keyboard.setScroll({ isDisabled: false }).catch(() => {})
                Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => {})
            }
        }
    }, [active])
}

export const useNative = () => {
    useStatusBarTheme()
    useSplashScreen()
    useHardwareBack()
    useKeyboardDismiss()
}

export default useNative
