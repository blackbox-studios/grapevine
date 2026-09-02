"use client"

import { useMemo, useState } from "react"

import Icon from "@/components/Icon"
import { KeyboardAwareColumn } from "@/components/KeyboardAware"
import { Wheel, WheelColumn } from "@/components/Wheel"
import { Button } from "@/components/ui/button"
import {
    Drawer,
    DrawerNested,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { cn } from "@/lib/utils"

/* Choose one of a handful of options on a phone: a field that opens a sheet holding a single
 * drum, the same control and the same surface <DatePicker/> gives a date.
 *
 * **This is a touch control, not a Select replacement.** A pointer has `<Select/>`, which is
 * a listbox and the right thing on a desktop. This exists because a listbox is the wrong
 * thing on iOS twice over: the panel opens over the surface it was opened from, and inside a
 * Vaul drawer the tap that would commit a choice never reaches it — iOS withholds the
 * synthesised click Radix listens for. A drum is scroll and a plain click on a `div`, both of
 * which the WebView delivers, and the sheet gives the choice the whole width of the screen.
 *
 * `options` are `{ value, label, icon }`; `icon` is drawn before the label in the row and in
 * the closed field, and may be omitted. The value commits as the drum settles rather than on
 * Done — Done only puts the sheet away, so a reader who scrolls and swipes it shut keeps what
 * they landed on, exactly as the date sheet behaves.
 *
 * `nested` says this opens from inside another drawer, which is the composer's case and
 * which Vaul has to be told about; leave it off in a page. */
const WheelSelect = ({
    value,
    onChange,
    options,
    label,
    placeholder = "Choose one",
    disabled,
    nested = false,
    className,
    /* The field's own id and aria wiring, when this stands inside a <FormControl/>. They
     * belong on the button, which is the element the label points at and the only part of
     * this control the form knows about. */
    ...props
}) => {
    const [open, setOpen] = useState(false)

    /* React state, not a URL, so Android's back gesture has nothing of its own to unwind
     * and would close the app from on top of the sheet. */
    useBackHandler(open, () => setOpen(false))

    const items = useMemo(
        () => options.map((option) => ({ ...option, key: option.value })),
        [options],
    )

    /* An unmatched value shows the placeholder in the closed field and parks the drum on its
     * first row; opening the sheet is what turns that into a selection. */
    const index = Math.max(
        0,
        items.findIndex((item) => item.value === value),
    )
    const selected = items.find((item) => item.value === value)

    const Root = nested ? DrawerNested : Drawer

    return (
        <>
            {/* Shaped as the field it stands in for, so the composer looks the same either
              * side of the desktop breakpoint and only the surface differs. */}
            <button
                type="button"
                disabled={disabled}
                onClick={() => {
                    /* The pill is not a preview — whatever sits under it is the value — so
                      * an unset field takes the row the drum parks on as the sheet opens,
                      * rather than showing a selection it has not made. */
                    if (!selected) onChange?.(items[0]?.value)
                    setOpen(true)
                }}
                aria-label={label}
                className={cn(
                    "flex h-12 w-full items-center justify-between gap-1.5 rounded-full bg-muted px-8 text-sm select-none disabled:opacity-50 dark:bg-input/30",
                    !selected && "text-muted-foreground",
                    className,
                )}
                {...props}
            >
                <span className="flex min-w-0 items-center gap-1.5">
                    {selected?.icon}
                    <span className="min-w-0 truncate">
                        {selected?.label ?? placeholder}
                    </span>
                </span>
                <Icon size="sm" className="shrink-0 text-muted-foreground">expand_more</Icon>
            </button>

            {/* repositionInputs is off for the same reason as every other drawer here:
              * Vaul's implementation keeps react-aria's scroll lock installed, which
              * swallows touches inside the Capacitor WebView. */}
            <Root open={open} onOpenChange={setOpen} repositionInputs={false}>
                <DrawerContent className="max-h-[85dvh]">
                    <KeyboardAwareColumn>
                        <DrawerHeader className="shrink-0">
                            <DrawerTitle>{label}</DrawerTitle>
                        </DrawerHeader>
                        <div className="px-4">
                            {open && (
                                <Wheel disabled={disabled}>
                                    <WheelColumn
                                        label={label}
                                        items={items}
                                        index={index}
                                        onIndex={(next) => onChange?.(items[next]?.value)}
                                        itemClassName="text-base px-4"
                                        renderItem={(item) => (
                                            <>
                                                {item.icon}
                                                <span className="min-w-0 truncate">
                                                    {item.label}
                                                </span>
                                            </>
                                        )}
                                    />
                                </Wheel>
                            )}
                        </div>
                        <div className="p-4">
                            <Button
                                type="button"
                                size="lg"
                                onClick={() => setOpen(false)}
                                className="w-full"
                            >
                                Done
                            </Button>
                        </div>
                    </KeyboardAwareColumn>
                </DrawerContent>
            </Root>
        </>
    )
}

export default WheelSelect
