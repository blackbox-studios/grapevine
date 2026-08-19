"use client"

import { useCallback, useMemo, useRef } from "react"
import { motion } from "motion/react"

import Ripple from "@/assets/svg/ripple.svg"
import { Privileged } from "@/components/Auth"
import Icon from "@/components/Icon"
import { Button } from "@/components/ui/button"
import { ROLES } from "@/lib/constants"
import { usePublish } from "@/lib/store/feed/hook"
import { useCurrentOrg } from "@/lib/store/org/hook"

/* The admin composer.
 *
 * Deliberately a single button that publishes a canned announcement, not a rich text
 * editor — the point of this surface right now is to prove the permission model and the
 * write path end to end: an ADMIN publishes, it persists to Postgres, and it appears in
 * every approved member's feed. The editor replaces the body of `handlePublish` and
 * nothing else; the store action, the endpoint, and the optimistic insert are already
 * whatever a real composer would need.
 *
 * Hidden from members by `<Privileged/>`. That is presentation only — the server runs
 * `requireMembership(..., { role: "ADMIN" })` before it writes anything, so a member who
 * calls the endpoint directly gets a 403 whether or not this button was ever rendered.
 *
 * **The gate is per-group, and follows the switcher.** Someone who administers their parish
 * and merely belongs to their diocese sees this in one and not the other, without signing
 * out — which is the whole reason the role check takes an `orgId` rather than resolving
 * against a single "primary" group. */

/* Rotated through so repeated taps produce a readable feed rather than six identical
 * cards. Dimensions are the images' intrinsic size: the feed card reserves its
 * aspect-ratio box from them before the image decodes, and without them the card collapses
 * to zero height on a cold cache and shifts as it loads. */
const EXAMPLES = [
    {
        title: "Great Vespers this Saturday",
        body: "Great Vespers will be served at 5:00pm this Saturday, followed by confessions. Please come and prepare for the Divine Liturgy.",
        media: [
            { kind: "IMAGE", url: "/img/mock/transfiguration.jpg", width: 1024, height: 683 },
        ],
    },
    {
        title: "Memory Eternal",
        body: "Please keep the family of our departed sister in your prayers. The funeral service will be served at the Cathedral on Friday morning. Memory eternal!",
        media: [],
    },
    {
        title: "Feast of St. Herman of Alaska",
        body: "The saint who brought and lived Holy Orthodoxy to America will be celebrated this weekend. Come and spend the weekend celebrating with us.",
        media: [{ kind: "IMAGE", url: "/img/mock/st-herman.jpg", width: 2000, height: 1500 }],
    },
    {
        title: "Coffee Hour Sign-Ups",
        body: "Several Sundays in October and November remain open for coffee hour hosting. Please see the sign-up sheet in the parish hall, or reply here.",
        media: [{ kind: "IMAGE", url: "/img/mock/coffee-hour.jpg", width: 464, height: 600 }],
    },
]

const ComposerButton = () => {
    const { publish, org, loading, canPublish } = usePublish()

    /* Which example is next. A ref, not state: it must survive re-renders without causing
     * one, and nothing renders it. */
    const cursor = useRef(0)

    /* One gate for both the button's `disabled` and the handler's early return, so the two
     * cannot drift apart. */
    const disabled = useMemo(() => loading || !canPublish, [loading, canPublish])

    const handlePublish = useCallback(async () => {
        if (disabled) return
        const example = EXAMPLES[cursor.current % EXAMPLES.length]
        cursor.current += 1
        await publish(example)
    }, [disabled, publish])

    return (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border/70 bg-card/40 p-4">
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-foreground">
                    Post to {org?.name ?? "your group"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                    Publishes an example announcement to every approved member.
                </span>
            </div>

            <Button asChild size="sm" disabled={disabled} className="shrink-0">
                <motion.button
                    type="button"
                    onClick={handlePublish}
                    disabled={disabled}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 700, damping: 32, mass: 0.6 }}
                >
                    {loading ? (
                        <Ripple
                            aria-label="Publishing post"
                            className="size-5 [&_circle]:stroke-current"
                        />
                    ) : (
                        <>
                            <Icon size="sm">edit</Icon>
                            New post
                        </>
                    )}
                </motion.button>
            </Button>
        </div>
    )
}

/* Admin-only wrapper, resolved against the selected group. A member of that group renders
 * nothing at all — they must not see an affordance for a tier they cannot reach — even if
 * they administer a different one. */
const Composer = () => {
    const { orgId } = useCurrentOrg()

    return (
        <Privileged role={ROLES.ADMIN} orgId={orgId}>
            <ComposerButton />
        </Privileged>
    )
}

export default Composer
