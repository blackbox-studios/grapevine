"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { ROLES, ROUTES } from "@/lib/constants"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { usePrivileged } from "@/lib/store/auth/hook"
import { cn } from "@/lib/utils"

/* Client-side role gating.
 *
 * **These hide UI; they do not secure anything.** Every rule enforced here is enforced
 * again on the server — `requireMembership(..., { role: "ADMIN" })` in the service layer is
 * what actually stops a member from publishing. Treat this file as presentation: it keeps
 * people from reaching for controls that would fail, and nothing more. A gate that exists
 * only here is a gate that does not exist, because the API is reachable with curl.
 *
 * Route-level auth (signed in vs not) is a different concern and lives in
 * `components/AuthGate.jsx`.
 *
 * Roles are per-group — being an admin of one parish grants nothing in another — so both
 * components take an optional `orgId`. Omit it and they resolve against the viewer's
 * primary group, which is the right default while there is one. */

/* Inline UI: buttons, tabs, menu entries.
 *
 * Renders `children` when the viewer meets or exceeds `role` in the group. Otherwise:
 *
 *   default        renders `fallback` (null — the control is simply absent)
 *   with `disabled` renders the control dimmed and non-interactive
 *
 * The convention for which to use: a viewer must not see affordances for a tier they can
 * never reach, so hide those. Show-but-disable is for signalling that an action exists at
 * a higher privilege level to someone plausibly close to it. */
export const Privileged = ({
    role = ROLES.ADMIN,
    orgId,
    disabled = false,
    fallback = null,
    children,
}) => {
    const allowed = usePrivileged(role, orgId)
    const mounted = useMounted()

    /* The viewer comes from a persisted store rehydrated on the client, so a prerender
     * cannot know the role. Deciding before mount would bake the signed-out answer into
     * the static HTML and flash the wrong state on hydration. */
    if (!mounted) return fallback

    if (allowed) return children

    if (disabled) {
        return (
            <span
                aria-disabled="true"
                className={cn("pointer-events-none opacity-50")}
            >
                {children}
            </span>
        )
    }

    return fallback
}

/* Whole routes. Redirects rather than hiding, so an unauthorized viewer lands somewhere
 * usable instead of on an empty page.
 *
 * `replace`, not `push`: a bounced navigation must not leave an entry for the back gesture
 * to land on — the same rule the auth gates follow. */
export const PrivilegedRoute = ({
    role = ROLES.ADMIN,
    orgId,
    redirect = ROUTES.DEFAULT,
    children,
}) => {
    const allowed = usePrivileged(role, orgId)
    const mounted = useMounted()
    const router = useRouter()

    useEffect(() => {
        if (mounted && !allowed) router.replace(redirect)
    }, [mounted, allowed, redirect, router])

    return mounted && allowed ? children : null
}
