"use client"

import { useKeyboardInset } from "@/lib/hooks/useNative.hook"
import { cn } from "@/lib/utils"

/* A flex column that keeps its own foot — a composer, a form's submit row — above the
 * on-screen keyboard. Wrap any surface with a field near the bottom of the screen in it;
 * everywhere but native iOS it is an ordinary div, since every other platform lifts the
 * field for us.
 *
 *     <KeyboardInset active={open}>
 *         …thread…
 *         <Composer />
 *     </KeyboardInset>
 *
 * It drives the measurement (useKeyboardInset, which explains the why) and spends it here:
 * the foot is padded by the keyboard's height and transitioned, so the composer glides up
 * with the keyboard rather than being reflowed after it.
 *
 * `active` gates the whole mechanism — pass the flag that says this surface is on screen
 * and holding a field, so a closed drawer or a desktop layout doesn't hold the keyboard off
 * the native layer for surfaces that never needed it.
 *
 * The two lengths are about where the surface's bottom edge already is:
 *   - `rest` — its padding with the keyboard down. Defaults to the home-indicator inset,
 *     what a surface flush with the bottom of the screen needs.
 *   - `offset` — how much of the keyboard something below it already covers, e.g.
 *     `var(--bottombar)` for a surface floating above the mobile nav. That much of the lift
 *     is already paid for, so it is subtracted. */
const KeyboardInset = ({
    active = true,
    rest = "var(--safe-bottom)",
    offset = "0px",
    className,
    children,
}) => {
    useKeyboardInset(active)

    return (
        <div
            style={{ "--kb-rest": rest, "--kb-offset": offset }}
            className={cn(
                "flex min-h-0 flex-1 flex-col pb-[max(var(--kb-rest),calc(var(--keyboard-inset)-var(--kb-offset)))] transition-[padding] duration-300 ease-out",
                className,
            )}
        >
            {children}
        </div>
    )
}

export default KeyboardInset
