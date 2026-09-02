"use client"

import { useEffect, useState } from "react"

import Ripple from "@/assets/svg/ripple.svg"
import Icon from "@/components/Icon"
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { HANDLE_PATTERN } from "@/lib/constants"
import { normalizeHandleInput } from "@/lib/name"

/* Choosing an @handle, live-checked — the whole control, and the hook behind it.
 *
 * **Two screens ask this question and they must ask it identically**: first-run orientation,
 * where the handle is picked, and the account's own Info page, where it is changed. The check
 * is the fiddly half — a debounce, a stale-answer guard, and three visual states in the field —
 * and two copies of it is two chances for one to fall behind. The *why* for each decision lives
 * here; the call sites say only which form the field belongs to.
 *
 * The hook ships in this file rather than in `lib/hooks/` because it exists for this field and
 * nothing else: separating them would put the debounce a folder away from the spinner that
 * explains it. */

/* How long a handle sits unchanged before it is checked. Long enough that typing a
 * fourteen-character handle is one request rather than fourteen, short enough that the answer
 * is there before a reader who paused has reached for the button. */
const CHECK_DELAY_MS = 400

/* Is this handle free? `null` while there is nothing worth asking about, then "checking",
 * "available" or "taken".
 *
 * **Only the answer is state, and it carries the handle it is an answer about.** "Checking" is
 * then *derived* — it is simply the gap between what the field holds and what the last reply
 * was about — which keeps the effect free of a synchronous setState and the cascading render
 * that comes with one. It also makes a stale reply harmless: a slow check that lands after the
 * reader has typed on no longer matches the value, so it renders as nothing rather than
 * reporting "taken" against a handle that is no longer on screen.
 *
 * `own` is the handle the viewer already wears, and it short-circuits to available. Without it
 * somebody editing their name but not their handle is told the one they have is taken, and the
 * form will not submit. */
export const useHandleCheck = (value, checkHandle, { own = null } = {}) => {
    const [answer, setAnswer] = useState(null)

    const handle = String(value ?? "").trim()
    /* Nothing to ask about until it could plausibly be valid. Checking a two-character fragment
     * mid-typing spends a request to be told what the local schema already knows, and flashes
     * an error at someone who simply has not finished typing. */
    const checkable = HANDLE_PATTERN.test(handle) && handle !== own

    useEffect(() => {
        if (!checkable) return

        let live = true
        const timer = setTimeout(async () => {
            const result = await checkHandle(handle)
            if (live) setAnswer(result)
        }, CHECK_DELAY_MS)

        return () => {
            live = false
            clearTimeout(timer)
        }
    }, [handle, checkable, checkHandle])

    if (handle === own) return { state: "available", reason: null }
    if (!checkable) return { state: null, reason: null }
    if (answer?.handle !== handle) return { state: "checking", reason: null }

    return {
        state: answer.available ? "available" : "taken",
        reason: answer.reason,
    }
}

/* The field itself: the `@` that is chrome rather than content, the normalization applied as
 * the reader types, and the three-state indicator on the right.
 *
 * **The spinner earns its keep.** While it turns, the form's action is deliberately disabled —
 * and without it that pause reads as a dead button rather than as the app checking.
 *
 * The availability answer and the format error share one line, and the format error wins: a
 * handle that is not a handle cannot be meaningfully "taken". */
export const HandleField = ({ form, status, label, description, disabled, autoFocus }) => (
    <FormField
        control={form.control}
        name="handle"
        render={({ field }) => (
            <FormItem className="w-full">
                {label && <FormLabel>{label}</FormLabel>}
                <FormControl>
                    <div className="relative">
                        {/* In the field so the handle reads the way it will appear on a
                            comment, without ever becoming part of the value. Typing one is
                            still tolerated; `normalizeHandleInput` strips it. */}
                        <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            @
                        </span>
                        <Input
                            autoComplete="off"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder="handle"
                            aria-label="Your handle"
                            autoFocus={autoFocus}
                            disabled={disabled}
                            className="pl-9 pr-12"
                            {...field}
                            /* Normalized as they type rather than at submit, so the field
                                always shows the value that will be saved instead of silently
                                transforming it afterwards. */
                            onChange={(event) =>
                                field.onChange(normalizeHandleInput(event.target.value))
                            }
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2">
                            {status?.state === "checking" && (
                                <Ripple
                                    aria-label="Checking that handle"
                                    className="size-5 text-muted-foreground [&_circle]:stroke-current"
                                />
                            )}
                            {status?.state === "available" && (
                                <Icon size="sm" className="text-success">
                                    check_circle
                                </Icon>
                            )}
                            {status?.state === "taken" && (
                                <Icon size="sm" className="text-destructive">
                                    cancel
                                </Icon>
                            )}
                        </span>
                    </div>
                </FormControl>

                {description}

                {status?.state === "taken" && !form.formState.errors.handle ? (
                    <p className="px-5 text-sm text-destructive">
                        {status.reason ?? "That handle is already taken."}
                    </p>
                ) : (
                    <FormMessage className="px-5" />
                )}
            </FormItem>
        )}
    />
)

export default HandleField
