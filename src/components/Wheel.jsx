"use client"

import { useCallback, useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

/* The iOS-style drum: snapping columns of options with the selection held in a pill at the
 * centre. <DateWheel/> stacks three of these for a date; <WheelSelect/> uses one.
 *
 * The snapping is CSS (`scroll-snap-type` / `scroll-snap-align`), not JavaScript, so the
 * momentum and rubber-banding are the platform's own and it feels native on a phone. JS only
 * reads where the scroll settled.
 *
 * Everything here is a scroll and a plain `click` on a `div`, which is the reason the group
 * picker in the composer is built from it rather than from a listbox: inside a Vaul drawer,
 * iOS never delivers the synthesised click that Radix's Select needs to commit a choice. */

export const WHEEL_ITEM_HEIGHT = 40
/* Odd, so there is a true centre row to align the pill to. */
export const WHEEL_VISIBLE = 5

const PAD = ((WHEEL_VISIBLE - 1) / 2) * WHEEL_ITEM_HEIGHT

/* The frame: fixed to a whole number of rows, with the selection pill drawn behind whatever
 * columns are placed in it so a row spanning several of them reads as one selected value
 * rather than as a coincidence. */
export const Wheel = ({ disabled, className, children }) => (
    <div
        className={cn(
            "relative w-full select-none",
            disabled && "pointer-events-none opacity-50",
            className,
        )}
        style={{ height: WHEEL_VISIBLE * WHEEL_ITEM_HEIGHT }}
    >
        <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 z-0 -translate-y-1/2 rounded-2xl bg-muted"
            style={{ height: WHEEL_ITEM_HEIGHT }}
        />

        <div className="relative flex h-full items-stretch gap-1">{children}</div>
    </div>
)

/* One column. `items` are `{ key, label }`, `index` is the selected offset, and `onIndex`
 * is called with the offset the scroll settled on. `renderItem` takes over the row's
 * contents where a label alone is not enough — a group's mark beside its name. */
export const WheelColumn = ({ items, index, onIndex, label, itemClassName, renderItem }) => {
    const ref = useRef(null)
    const settling = useRef(null)

    /* Keep the scroll position in step with the value, including when another column
     * clamps this one. The tolerance check is what stops this fighting the user's own
     * scroll — without it, every settle would re-trigger a scroll to where it already is. */
    useEffect(() => {
        const element = ref.current
        if (!element) return
        const target = index * WHEEL_ITEM_HEIGHT
        if (Math.abs(element.scrollTop - target) > 1) element.scrollTop = target
    }, [index])

    useEffect(() => () => clearTimeout(settling.current), [])

    /* Read the selection only once scrolling has stopped. Reacting to every scroll event
     * would fire a change per frame during a fling, and on a clamped column that turns
     * into a visible fight between the user and the correction. */
    const handleScroll = useCallback(() => {
        clearTimeout(settling.current)
        settling.current = setTimeout(() => {
            const element = ref.current
            if (!element) return
            const next = Math.min(
                items.length - 1,
                Math.max(0, Math.round(element.scrollTop / WHEEL_ITEM_HEIGHT)),
            )
            if (next !== index) onIndex(next)
        }, 110)
    }, [items.length, index, onIndex])

    return (
        <div
            ref={ref}
            onScroll={handleScroll}
            role="listbox"
            aria-label={label}
            tabIndex={0}
            className="relative z-10 h-full flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain scrollbar-none focus-visible:outline-none"
            style={{
                /* Fades the ends so the column reads as a drum rather than a cropped list.
                 * A mask rather than overlaid gradients, which would need to match the
                 * background and would break the moment the theme changed. */
                maskImage:
                    "linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)",
                WebkitMaskImage:
                    "linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)",
                scrollbarWidth: "none",
            }}
        >
            {/* Half a viewport of padding at each end, so the first and last values can
              * reach the centre line. */}
            <div style={{ height: PAD }} aria-hidden="true" />

            {items.map((item, itemIndex) => (
                <div
                    key={item.key ?? item.label}
                    role="option"
                    aria-selected={itemIndex === index}
                    onClick={() => onIndex(itemIndex)}
                    className={cn(
                        "flex snap-center items-center justify-center gap-2 text-lg tabular-nums transition-[color,opacity] duration-150 select-none",
                        itemIndex === index
                            ? "font-medium text-foreground"
                            : "cursor-pointer text-muted-foreground/70",
                        itemClassName,
                    )}
                    style={{ height: WHEEL_ITEM_HEIGHT }}
                >
                    {renderItem ? renderItem(item, itemIndex === index) : item.label}
                </div>
            ))}

            <div style={{ height: PAD }} aria-hidden="true" />
        </div>
    )
}
