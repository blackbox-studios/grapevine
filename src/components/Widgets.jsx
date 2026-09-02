"use client"

import { motion } from "motion/react"

import Hyperlink from "@/components/Hyperlink"
import Icon from "@/components/Icon"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { initials } from "@/lib/name"
import { useOpenProfile } from "@/lib/store/profile/hook"
import { appPath, cn, formatCompact, gradientFor, orgInitials } from "@/lib/utils"

/* User/author avatar. Uses the profile image when one is provided; otherwise falls back to
 * a deterministic gradient (via gradientFor()) with the person's initials. Size it with a
 * `size-*` class via `className`.
 *
 * **Takes the person, not a name string.** Initials come from `firstName`/`lastName`
 * directly, because a rendered display name may lead with a title — splitting "Dn. Paul"
 * gives "DP", which is neither of his names. The gradient is keyed on the handle rather
 * than the name for the same reason it is stable at all: a handle identifies one person,
 * where two Anna's would otherwise share a colour and one person changing their name would
 * change theirs. */
export const Avatar = ({ person, className }) =>
    person?.avatar ? (
        <img
            src={appPath(person.avatar)}
            alt=""
            aria-hidden="true"
            className={cn("shrink-0 rounded-full object-cover", className)}
        />
    ) : (
        <span
            className={cn(
                "flex shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold text-white",
                className,
            )}
            style={gradientFor(person?.handle)}
            aria-hidden="true"
        >
            {initials(person)}
        </span>
    )

/* A person, as the way to their card.
 *
 * **One component because a person is named in every byline the app draws** — over a comment,
 * in front of a caption, at the head of a post, in "Liked by …" — and every one of them has to
 * open the same way and hover the same way.
 *
 * It opens `<ProfileCard/>` rather than navigating, which is what lets a name inside an open
 * post do something useful: a real navigation would take the post down with it, and the reader
 * wanted to glance at whoever wrote the comment and carry on reading. A `<button>` for that
 * reason, with `<Hyperlink soft>` supplying the hover — the app's one link treatment, so a name
 * and an actual link in the same paragraph behave identically under the cursor.
 *
 * `children` is the label. It defaults to the @handle, which is what a byline under a comment
 * shows; pass `displayName(person)` where the surface addresses them by name instead. The
 * *behaviour* is the same either way, which is the point of it being one component.
 *
 * `truncate` is for a label in a row that can run out of room — see `<Hyperlink/>`. It also
 * puts `min-w-0` on the button, without which a flex parent refuses to shrink it.
 *
 * Renders nothing at all without a handle: it is the id the card is opened by, so a person
 * without one has nothing to link to. */
export const HandleLink = ({ person, children, truncate, className }) => {
    const { openProfile } = useOpenProfile()

    return person?.handle ? (
        <button
            type="button"
            onClick={() => openProfile(person.handle)}
            className={cn(
                "cursor-pointer bg-transparent p-0 text-left",
                truncate && "min-w-0",
                className,
            )}
        >
            <Hyperlink soft truncate={truncate}>
                {children ?? person.handle}
            </Hyperlink>
        </button>
    ) : null
}

/* A group's mark, for the switcher and anywhere else a parish is listed.
 *
 * Separate from <Avatar/> rather than a variant of it because the two derive their fallback
 * from different things and neither derivation works on the other's shape: a person's
 * initials come from name *parts* that an organization does not have, and an organization's
 * come from words in a single name ("Holy Trinity Cathedral" → "HT"), which is exactly the
 * split-the-display-name approach <Avatar/> exists to avoid for people. The gradient is
 * keyed on the slug for the same reason a person's is keyed on their handle: one stable
 * identifier per group, so renaming a parish does not recolour it. */
export const OrgAvatar = ({ org, className }) =>
    org?.avatar ? (
        <img
            src={appPath(org.avatar)}
            alt=""
            aria-hidden="true"
            className={cn("shrink-0 rounded-full object-cover", className)}
        />
    ) : (
        <span
            className={cn(
                "flex shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold text-white",
                className,
            )}
            style={gradientFor(org?.slug ?? org?.id)}
            aria-hidden="true"
        >
            {orgInitials(org?.name)}
        </span>
    )

export const Close = ({ className, children, ...props }) => (
    <Button
        type="button"
        variant="ghost"
        aria-label="Close"
        className={cn(
            "flex size-9 rounded-full border-none bg-background shadow-[4px_4px_10px_4px_rgba(0,0,0,0.12)] hover:bg-muted",
            className,
        )}
        {...props}
    >
        {children ?? <Icon>close</Icon>}
    </Button>
)

/* A centered surface on a dimmed backdrop, for the overlays that are not Radix dialogs — the
 * desktop presentations of the slide routes, which are mounted by <SlideRouter/> and dismissed
 * by unwinding a history entry rather than by a primitive's open state.
 *
 * The backdrop is hidden from the accessibility tree: the labelled Close button and Escape are
 * the exposed ways out, and announcing a second unnamed control would only be a decoy. It is
 * still a `<button>` rather than a div so a click lands without a handler on a non-interactive
 * element.
 *
 * The fade belongs here rather than at a call site because it is what makes two different
 * dialogs read as the same surface arriving.
 *
 * The pill sits in the window's corner, which reads as the surface's own corner only while the
 * surface is most of the window — true of the photo dialog and not of a narrow one. Pass
 * `close={false}` and draw it anchored to the surface instead; the styling is `<Close/>` either
 * way, so the two still match. */
export const Overlay = ({ dismiss, label = "Close", close = true, children }) => (
    <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
    >
        <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={dismiss}
            className="absolute inset-0 cursor-default bg-black/80"
        />
        {children}
        {close && (
            <Close onClick={dismiss} aria-label={label} className="fixed right-4 top-4 z-10" />
        )}
    </motion.div>
)

/* A post's attachment, as a row: icon, name, type and size, and one trailing affordance.
 *
 * **One component for both ends of the file's life.** The feed card and the post's detail
 * surfaces render it as a link that downloads; the composer renders the file just picked, with
 * an x to take it off again. Those are the same row with a different last child, and writing
 * them separately is how the two drift into disagreeing about what a 2.4MB PDF looks like.
 *
 * Pass `href` for the download form and `onRemove` for the editable one — `href` wins if both
 * are given, since a row that can be opened is the one a reader is looking at.
 *
 * `name`/`type`/`size` are exactly the shape `projectMedia` ships as `post.document`, so the
 * card spreads it straight in. */
export const Attachment = ({ name, type, size, href, onRemove, className }) => {
    const body = (
        <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
                <Icon>description</Icon>
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-medium">{name}</span>
                <span className="text-xs uppercase text-muted-foreground">
                    {[type, size].filter(Boolean).join(" · ")}
                </span>
            </span>
        </>
    )

    const shell = "flex items-center gap-3 rounded-lg border bg-muted/40 p-3"

    if (href) {
        return (
            <a
                href={href}
                /* `download` asks the browser to save it under the name on the row rather than
                 * the object's UUID key; a cross-origin URL — which storage always is — makes
                 * that a hint the browser may decline, in which case `target` is what keeps a
                 * PDF opening in its own tab instead of navigating the app away from itself. */
                download={name}
                target="_blank"
                rel="noreferrer"
                className={cn(shell, "transition-colors hover:bg-muted", className)}
            >
                {body}
                <Icon className="ml-auto text-muted-foreground">download</Icon>
            </a>
        )
    }

    return (
        <div className={cn(shell, className)}>
            {body}
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={`Remove ${name}`}
                    className="ml-auto cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                >
                    <Icon>close</Icon>
                </button>
            )}
        </div>
    )
}

/* "Are you sure?" for a destructive action reached by a tap or a click.
 *
 * **A press-and-hold does not ask.** The one path that skips this is a held comment row
 * revealing a single destructive item (`components/HoldMenu.jsx`): that hold *is* the
 * deliberate act a dialog would otherwise be asking for, so asking again afterwards is one
 * confirmation too many. Everything reached by a menu item does ask, on every platform — a tap
 * is not deliberate in the way a hold is.
 *
 * Generic on purpose: it takes the wording rather than owning any, so a comment and a post
 * can ask different questions through the same component. Whatever the wording says, it must
 * be true — every caller here removes something for everyone and cannot be undone. */
export const ConfirmDialog = ({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = "Delete",
    onConfirm,
}) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                    Cancel
                </Button>
                <Button
                    variant="destructive"
                    onClick={() => {
                        onOpenChange(false)
                        onConfirm()
                    }}
                >
                    {confirmLabel}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
)

export const YayOrNay = ({ value }) =>
    value ? (
        <Icon size="md" className="text-success" aria-label="check">check</Icon>
    ) : (
        <Icon size="md" className="text-destructive" aria-label="x">close</Icon>
    )

/* One tally — a follower or following count that opens the profile card behind it. A button
 * rather than a link, because it opens a card and a card is not a place. Generic and
 * prop-driven rather than specific to the account page that uses it today, which is what a
 * small misc widget in this file is for. */
export const Count = ({ value, label, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="flex cursor-pointer flex-col items-center rounded-2xl px-4 py-1 transition-colors hover:bg-accent"
    >
        <span className="text-lg font-semibold tabular-nums">{formatCompact(value)}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
    </button>
)

