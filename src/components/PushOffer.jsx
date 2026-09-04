"use client"

import Ripple from "@/assets/svg/ripple.svg"
import { Button } from "@/components/ui/button"
import { usePushPermission } from "@/lib/store/push/hook"
import { cn } from "@/lib/utils"

/* The standing offer to turn push notifications on, wherever it needs to be made.
 *
 * ── Why this is a component and not a copied block ───────────────────────────
 *
 * Turning push on is more than one call. It is: is this platform capable at all, has the
 * reader already granted it, has the reader already *refused* it — and that last one changes
 * the action, because a spent refusal cannot be prompted again and the tap has to open the OS's
 * own settings instead. `usePushPermission().turnOn` decides that part; this decides the rest —
 * when to say nothing, what to show while the prompt is up, and what the button is called.
 *
 * Every surface that wants to offer notifications wants all of it, and the second copy of a
 * three-state rule is where the states start disagreeing. So: account settings makes the
 * standing offer, and the sign-up surface makes it the moment somebody asks to be reminded
 * about a date. Anything else that comes to need it renders this.
 *
 * ── When it renders nothing ──────────────────────────────────────────────────
 *
 * On a platform with no push at all (the web), and once permission is granted. Both are the
 * same judgement: an offer to turn on something that is already on, or that cannot be turned
 * on, is a control that does nothing — and a heading over one is worse than no section.
 *
 * `granted` is the one thing a caller may put in that gap. Account settings has something to
 * say there ("notifications are on for this device"); a drawer asking about one shift does not,
 * and passes nothing.
 *
 * ── A button, not a switch ───────────────────────────────────────────────────
 *
 * A switch promises it can be moved back, and turning push *off* is a trip to the OS's settings
 * whatever this app does. Turning it on is the one direction the app can act in, so the control
 * is shaped like the one thing it can do.
 */
const PushOffer = ({
    description,
    granted = null,
    label = "Turn on notifications",
    size = "lg",
    className,
}) => {
    const { supported, permission, enabling, turnOn } = usePushPermission()

    if (!supported) return null
    if (permission === "granted") return granted

    return (
        <div className={cn("flex flex-col items-start gap-3", className)}>
            {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
            )}
            <Button
                variant="outline"
                size={size}
                onClick={turnOn}
                disabled={enabling}
                className={size === "lg" ? "px-8" : "px-4"}
            >
                {enabling ? (
                    <Ripple
                        aria-label="Turning on notifications"
                        className={cn(
                            "[&_circle]:stroke-current",
                            size === "lg" ? "size-8" : "size-5",
                        )}
                    />
                ) : (
                    /* A refusal cannot be prompted again, so the tap goes to the OS's settings
                     * and the label has to say so — "Turn on notifications" on a button that
                     * leaves the app is a button that appears not to work. */
                    permission === "denied" ? "Open notification settings" : label
                )}
            </Button>
        </div>
    )
}

export default PushOffer
