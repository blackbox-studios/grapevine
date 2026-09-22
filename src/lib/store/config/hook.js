"use client"

import { useEffect } from "react"

import { APP_VERSION } from "@/lib/constants"
import { isNative, onAppState } from "@/lib/native"
import { olderThan } from "@/lib/utils"
import useConfigStore from "./store"

/* Keeps the flags current. Mounted once by <App/>, above both route groups and outside every
 * gate, because the version floor has to be answerable before anybody has signed in.
 *
 * **On mount, on every return to the foreground, and on regaining a connection — but never on
 * a timer.** A flag is something somebody flips once, so what matters is that every arrival at
 * the app is fresh, not that an app already open notices within seconds. A poll would be a
 * serverless invocation per viewer per interval bought for the minutes between a reader
 * foregrounding and a reader foregrounding, and Firebase's own client SDK is far lazier than
 * this (its default fetch interval is twelve hours).
 *
 * The three signals are `useSessionResume`'s, for its reasons: `appStateChange` is the platform
 * telling us directly and is the authoritative one on native, `visibilitychange` is the same
 * event for a browser tab and is web-only because supabase-js's own handling is taken over on
 * native, and `online` is either target getting its connection back — which is when a client
 * running on the fail-open defaults can finally learn what they should have been. */
export const useConfigWatch = () => {
    const load = useConfigStore((state) => state.load)

    useEffect(() => {
        load()

        const offAppState = onAppState((active) => {
            if (active) load()
        })

        const onOnline = () => load()
        window.addEventListener("online", onOnline)

        const onVisible = () => {
            if (document.visibilityState === "visible") load()
        }
        if (!isNative()) document.addEventListener("visibilitychange", onVisible)

        return () => {
            offAppState()
            window.removeEventListener("online", onOnline)
            document.removeEventListener("visibilitychange", onVisible)
        }
    }, [load])
}

/* Whether the flags have been asked for, win or lose. What anything that would otherwise fire a
 * request into a switched-off feature waits on — see the store. */
export const useConfigSettled = () => useConfigStore((state) => state.settled)

/* Whether this build is too old to go on, which is the whole question `<UpdateRequired/>` asks.
 *
 * **Native only.** A browser is always running whatever the deploy just served it, so there is
 * nothing for a web reader to update and a wall in front of them would be one they could not
 * get past by any action at all.
 *
 * False until the flags have been read, which is what keeps the drawer from flashing over the
 * first frames of a launch that turns out to be perfectly current. */
export const useUpdateRequired = () =>
    useConfigStore((state) => isNative() && olderThan(APP_VERSION, state.minimumVersion))
