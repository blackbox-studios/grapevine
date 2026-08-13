import { cn } from "@/lib/utils"

/* A flex column that keeps its last child clear of the on-screen keyboard — drop it into
 * any bottom-anchored surface (a Vaul drawer's content, a fixed sheet) that ends in a
 * composer, a button row, or any control the keyboard would otherwise cover.
 *
 * Give it a scrollable region (`overflow-y-auto`, and `min-h-0` so it can shrink) as one
 * child and the pinned control as the last: the column pads its foot by the keyboard's
 * height, the scroll region gives up exactly that much room, and the control ends up
 * sitting on top of the keyboard. With the keyboard down the padding is just the
 * home-indicator inset, so nothing shifts on a device without one.
 *
 * The offset is `--bottom-inset` (`max(--safe-bottom, --keyboard-inset)`), driven on iOS by
 * useKeyboardInset in useNative.hook.js; a browser and Android keep `--keyboard-inset` at 0
 * and fall back to the safe-area bottom on their own. The transition matches the keyboard's
 * animation, which has only just begun when the inset lands, so the two move together. Full
 * rationale, and why this is padding on a wrapper rather than a moved edge: the keyboard
 * section of native-architecture.md (a Vaul drawer writes its own inline `transition:
 * transform` onto its content element, which would otherwise drop this from the animation).
 *
 * `flex-1 min-h-0` assume a flex-column parent; pass a `className` to override if the
 * surface positions it some other way. */
export const KeyboardAwareColumn = ({ className, ...props }) => (
    <div
        className={cn(
            "flex min-h-0 flex-1 flex-col pb-(--bottom-inset) transition-[padding-bottom] duration-250 ease-out",
            className,
        )}
        {...props}
    />
)
