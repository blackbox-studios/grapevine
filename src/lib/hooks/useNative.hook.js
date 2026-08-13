"use client"

import { useEffect, useRef } from "react"
import { App as CapacitorApp } from "@capacitor/app"
import { Keyboard } from "@capacitor/keyboard"
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

export const useNative = () => {
    useStatusBarTheme()
    useSplashScreen()
    useHardwareBack()
    useKeyboardDismiss()
}

export default useNative

