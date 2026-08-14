"use client"

import { useEffect, useLayoutEffect } from "react"

/* `useLayoutEffect` on the client (runs before paint); `useEffect` on the server, where
 * layout effects don't run. Use when the effect must land before the first painted frame —
 * e.g. seeding a store so an in-app open paints its known photo without a one-frame
 * skeleton flash. */
const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect

export default useIsomorphicLayoutEffect
