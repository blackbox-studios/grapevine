"use client"

import { useRef, useState } from "react"
import { motion } from "motion/react"

import FocusLens, { ABOVE_LENS } from "@/components/FocusLens"
import Icon from "@/components/Icon"
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
} from "@/components/ui/popover"
import { useLongPress } from "@/lib/hooks/useLongPress.hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { cn } from "@/lib/utils"

/* Press and hold a thing to act on it — the whole gesture, in one component.
 *
 * A touch screen has no hover, so a control a pointer device reveals on hover needs a second
 * way in on a phone: holding the thing itself. What that costs is not the press but everything
 * around it — measuring the element, blurring the viewport, redrawing the element sharp on
 * top of the blur, anchoring a menu to it, and hiding the original so the copy is the only
 * one visible. It is written once here so a second caller cannot end up subtly different.
 *
 * **Reach for this only where there is nowhere to put a button.** A comment row is that case:
 * a trash icon on every row would crowd the thread, so a pointer gets one on hover and a
 * finger gets the hold. Anything with chrome of its own — a post card's header, which has a
 * corner for an ellipsis — should offer the same visible menu on both platforms instead. Two
 * entrances to one action on the platform that only needs one is worse than either alone.
 *
 * **The content is rendered twice, and that is not an implementation detail to hide.**
 * `children` goes into the real element *and* into the lens copy — read the header of
 * `FocusLens` for why a copy is the only thing that can work inside a Vaul drawer.
 *
 * **The copy is the element's own `className` on its own box, inside a plate.** That nesting
 * is what keeps the gesture honest: the lens draws the copy at the original's *measured* box,
 * so anything that changes that box's padding moves the content out from under the finger
 * holding it and the whole block visibly jumps at the moment of the press. Merging the
 * highlight's classes into the element's is exactly how that happens, so the highlight stays a
 * wrapper. A caller that needs the plate to breathe past its content should bleed that wrapper
 * with a matched negative-margin/padding pair (`-mx-3 px-3`) rather than pad the element.
 *
 * Everything else about the duplication is handled here — in particular the original fading
 * to fully transparent while held, which the caller must not also try to do.
 *
 * Renders nothing at all when `items` is empty. A menu with no entries is not a menu, and an
 * element that takes a hold and then does nothing is worse than one that ignores it — so a
 * viewer with no available action simply gets the plain element back.
 *
 * Reference caller: `components/Comments.jsx`. */

const HoldMenu = ({
    enabled = true,
    items = [],
    className,
    /* What the element's resting opacity is — a comment awaiting confirmation renders at
     * 0.6. Held, it always goes to 0 regardless, because the lens is drawing its copy at
     * these exact coordinates and only one of the two may be visible. */
    opacity = 1,
    /* Motion props the caller owns: a layout animation, an entrance, an exit. `animate` is
     * not among them — this component composes it from `opacity` and the held state. */
    motionProps,
    children,
}) => {
    const [open, setOpen] = useState(false)
    /* Where the element sits in the viewport, sampled at the moment of the press — which is
     * the only moment it can be, since the lens draws its copy in viewport coordinates. */
    const [rect, setRect] = useState(null)
    const ref = useRef(null)

    const active = enabled && items.length > 0

    const held = useLongPress(
        () => {
            if (!ref.current) return
            setRect(ref.current.getBoundingClientRect())
            setOpen(true)
        },
        { enabled: active },
    )

    /* The menu is open/closed React state rather than a URL, so Android's back gesture has
     * nothing to unwind and would close the app from on top of it. */
    useBackHandler(open, () => setOpen(false))

    const element = (
        <motion.div
            ref={ref}
            {...motionProps}
            animate={{ opacity: open ? 0 : opacity }}
            transition={{
                ...motionProps?.transition,
                opacity: { duration: 0.2, ease: "easeInOut" },
            }}
            {...held}
            className={cn(
                className,
                /* A hold on a paragraph is otherwise the WebView's gesture for selecting it,
                 * and the selection callout lands on top of the menu. Only elements that
                 * actually take the hold give that up. */
                active && "select-none",
            )}
        >
            {children}
        </motion.div>
    )

    if (!active) return element

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>{element}</PopoverAnchor>

            {/* The rest of the screen goes soft and this element does not. Anchored by the
              * real element's box, so the copy lands precisely where the reader pressed
              * rather than animating in from somewhere. */}
            <FocusLens active={open} rect={rect}>
                <div className="bg-muted shadow-lg">
                    <div className={className}>{children}</div>
                </div>
            </FocusLens>

            {/* Anchored to the element rather than floating in the middle of the surface,
              * the way a held-item menu reads on a phone — it has to stay visibly attached
              * to the thing being acted on. Offset clear of it rather than over it, because
              * the element is held sharp to show what the action would apply to and a menu
              * covering it hides the very thing the reader is confirming. */}
            <PopoverContent
                align="start"
                side="bottom"
                sideOffset={4}
                /* **Focus leaving this menu is not a dismissal, inside a drawer.**
                 *
                 * The hold opens the menu mid-gesture, and Radix moves focus into it. When
                 * the finger lifts, the compatibility mousedown a touch screen emits lands
                 * on a plain div and Chrome blurs whatever was focused — so the menu loses
                 * focus with nothing to hand it to. On a page that is the end of it. Inside
                 * a Vaul drawer it is not: the drawer is a modal Radix dialog with a focus
                 * trap, the trap sees focus go nowhere and pulls it back to the drawer
                 * surface, and that focusin lands outside this menu, which reads it as an
                 * interaction elsewhere and closes. The blur fades in and reverses, ~50ms
                 * after the haptic said the hold took.
                 *
                 * Which is why the same code was right on iOS and wrong on Android: WebKit
                 * does not move focus on a tap on a non-focusable element, so nothing is
                 * ever blurred and the trap never fires. Chrome does, so it does.
                 *
                 * Declining the focus half only. `onPointerDownOutside` is untouched, so a
                 * tap on the scrim still dismisses; the menu simply stops treating the
                 * trap's own housekeeping as the reader's decision. */
                onFocusOutside={(event) => event.preventDefault()}
                /* The menu is the one thing the blur must not take. */
                className={cn(ABOVE_LENS, "w-auto min-w-40 gap-0 rounded-3xl p-1.5")}
            >
                {items.map((item) => (
                    <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                            setOpen(false)
                            item.onSelect()
                        }}
                        className={cn(
                            "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-base font-medium transition-colors",
                            item.destructive
                                ? "text-destructive hover:bg-destructive/10"
                                : "hover:bg-accent",
                        )}
                    >
                        {/* A Material ligature name, or a drawn SVG component. Both are in
                            use: a comment row's actions are ligatures, and the group switcher
                            passes the same bespoke gear its desktop hover control uses, so the
                            one action does not appear as two different glyphs by platform. */}
                        {typeof item.icon === "string" ? (
                            <Icon size="md">{item.icon}</Icon>
                        ) : (
                            <item.icon className="size-5 shrink-0" />
                        )}
                        {item.label}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    )
}

export default HoldMenu
