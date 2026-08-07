"use client"

import { useSyncExternalStore } from "react"

const emptySubscribe = () => () => {}

/* True only after the component has hydrated on the client. Uses useSyncExternalStore
 * (server snapshot false, client snapshot true) so the server and first client render
 * agree without a setState-in-effect. Handy for client-only values that would
 * otherwise cause a hydration mismatch — e.g. next-themes' active theme. */
export const useMounted = () =>
    useSyncExternalStore(emptySubscribe, () => true, () => false)

export default useMounted
