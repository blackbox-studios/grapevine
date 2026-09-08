"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"

import { ROUTES } from "@/lib/constants"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { useGatewayDestination } from "@/lib/store/auth/hook"

/* Where a *signed-in* viewer belongs.
 *
 * <AuthGate/> answers "are you signed in". This answers the next question: having signed
 * in, may you actually use the app, and is there anything you have to do first. Three
 * outcomes, in precedence order:
 *
 *   access !== ACTIVE   → /access    no group will have you; nothing else matters
 *   onboardedAt is null → /welcome   in, but orientation is unfinished
 *   otherwise           → the app
 *
 * **Both directions are driven by one function**, `useGatewayDestination()`. That is the
 * whole design: two gates each deciding independently is how redirect loops are written —
 * one sends you to /welcome, the other decides you don't belong there and sends you back,
 * forever. Here there is a single answer and both gates merely obey it.
 *
 * Neither decides before there is a viewer to read: the destination is `undefined` until
 * one has been resolved, and both render nothing while that is true. */

/* Wraps the app shell: holds a viewer who has somewhere else to be. */
export const MemberGate = ({ children }) => {
    const destination = useGatewayDestination()
    const mounted = useMounted()
    const router = useRouter()

    const settled = mounted && destination !== undefined

    useEffect(() => {
        if (settled && destination) router.replace(destination)
    }, [settled, destination, router])

    return settled && !destination ? children : null
}

/* The mirror, wrapping the gateway screens: sends a viewer back into the app once they no
 * longer belong here, and keeps them on the correct gateway screen if they landed on the
 * wrong one (an onboarded member typing /welcome, say). */
export const GatewayRedirect = ({ children }) => {
    const destination = useGatewayDestination()
    const mounted = useMounted()
    const pathname = usePathname()
    const router = useRouter()

    const settled = mounted && destination !== undefined

    useEffect(() => {
        if (!settled) return
        if (!destination) {
            router.replace(ROUTES.DEFAULT)
            return
        }
        if (destination !== pathname) router.replace(destination)
    }, [settled, destination, pathname, router])

    return settled && destination === pathname ? children : null
}

export default MemberGate
