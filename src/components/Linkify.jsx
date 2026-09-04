"use client"

import copy from "copy-to-clipboard"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { MenuItems } from "@/components/HoldMenu"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { useLongPress } from "@/lib/hooks/useLongPress.hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { isNative } from "@/lib/native"
import { linkTokens } from "@/lib/utils"

/* A URL somebody typed into a post, comment or caption, rendered as something a reader can
 * actually go to.
 *
 * **A plain `<a>` is the whole of the tap.** Capacitor's navigation delegate cancels any
 * top-level navigation off the app's own origin and hands the URL to the OS, on both
 * platforms, so the link opens in the phone's browser without a plugin and without this
 * component knowing what a browser is. The tap needs no help; what it needs is not to be
 * intercepted.
 *
 * **The hold is native-only, and it is ours.** Android's WebView has no link menu at all, and
 * WebKit's is turned off from both ends — `globals.css` suppresses `-webkit-touch-callout`
 * across the packaged app, and `ios.allowsLinkPreview: false` in `capacitor.config.json`
 * closes the context menu that survives it. So the app draws its own: the same rows a held
 * comment answers with, from the same `<MenuItems/>`. In a browser the hold stays off, because
 * Safari and Chrome already offer theirs on that gesture and two menus racing one press is
 * worse than either.
 *
 * **Not `<Hyperlink/>`**, for the reason its own header gives about `truncate`: that primitive
 * is an `inline-flex` box sized to its content, and a URL is the one run of text in the app
 * long enough to need to break mid-word. It would overflow the paragraph rather than wrap. So
 * the link takes the link colour and no hover treatment at all, which is what the Hyperlinks
 * rule in `frontend-architecture.md` asks for in exactly this case. */

const ExternalLink = ({ href, children }) => {
    const native = isNative()
    const [open, setOpen] = useState(false)
    /* Set by the hold and read by the click a lifted finger fires straight afterwards —
     * without it, opening the menu also follows the link, and the reader is in their browser
     * looking at the thing they were deciding whether to visit. */
    const held = useRef(false)

    const hold = useLongPress(
        () => {
            held.current = true
            setOpen(true)
        },
        { enabled: native },
    )

    /* React state rather than a URL, so Android's back gesture closes the menu instead of
     * unwinding the post it is open over. */
    useBackHandler(open, () => setOpen(false))

    const items = [
        {
            label: "Open in browser",
            icon: "open_in_new",
            /* The same navigation the tap makes, so it goes out through the same delegate. */
            onSelect: () => window.location.assign(href),
        },
        {
            label: "Copy link",
            icon: "content_copy",
            onSelect: () => {
                copy(href)
                toast.success("Link copied")
            },
        },
    ]

    const link = (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            {...hold}
            onPointerDown={(event) => {
                held.current = false
                /* A link can sit inside something that takes a hold of its own — a comment row
                 * is one — and both would answer the same press with a menu. The innermost
                 * thing pressed is the one the reader meant. */
                if (native) event.stopPropagation()
                hold.onPointerDown(event)
            }}
            onClick={(event) => {
                if (held.current) event.preventDefault()
            }}
            /* `wrap-anywhere` rather than the `wrap-break-word` the bodies around it carry: a
             * URL is one token, so only a break offered *inside* a word keeps a long address
             * inside the column instead of pushing the card wide. */
            className="text-link wrap-anywhere"
        >
            {children}
        </a>
    )

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>{link}</PopoverAnchor>
            <PopoverContent
                align="start"
                side="bottom"
                sideOffset={4}
                /* Comments render inside a Vaul drawer on mobile, whose focus trap would
                 * otherwise close this menu the moment the finger lifts. See the long note on
                 * the same prop in `<HoldMenu/>`. */
                onFocusOutside={(event) => event.preventDefault()}
                className="w-auto min-w-40 gap-0 rounded-3xl p-1.5"
            >
                <MenuItems items={items} onSelect={() => setOpen(false)} />
            </PopoverContent>
        </Popover>
    )
}

/* Author text with its URLs live. Renders a bare string when there is nothing to link, so it
 * is safe to wrap every body surface with it. */
const Linkify = ({ text }) => (
    <>
        {linkTokens(text).map((part, index) =>
            part.href ? (
                <ExternalLink key={index} href={part.href}>
                    {part.text}
                </ExternalLink>
            ) : (
                part.text
            ),
        )}
    </>
)

export default Linkify
