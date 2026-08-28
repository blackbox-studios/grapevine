"use client"

import { useCallback, useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import Ripple from "@/assets/svg/ripple.svg"
import { KeyboardAwareColumn } from "@/components/KeyboardAware"
import OrgAvatarPicker from "@/components/OrgAvatarPicker"
import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MAX_ORG_BIO_LENGTH, MAX_ORG_NAME_LENGTH } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { useOrgEditor } from "@/lib/store/org/hook"

/* Group settings — a dialog on a desktop, a bottom sheet on a phone.
 *
 * **Shaped after the composer, deliberately.** Both are "act on the thing you were just
 * looking at, then carry on": a post you are writing, a parish you administer. Neither is a
 * destination, so neither gets a URL — what is open is component state, which is also what
 * keeps Android's back gesture honest (`useBackHandler` closes the surface; a route would put
 * an entry in history for the gesture to unwind instead, and closing the app from on top of a
 * sheet is the failure that produces).
 *
 * It has been three other things on the way here, and each move was away from treating it as
 * a place. It was a page at `/settings/groups/edit?org=<id>` reached through a list screen —
 * the list existed only to choose between groups the switcher already lists, and the page
 * flashed "Group not found" on every exit because leaving a page clears its search params
 * mid-fade. Then a slide route, which read the overlay as the mechanism rather than as one
 * presentation of it. Then an ordinary runtime-route page. The runtime-route machinery is
 * still there and still the right answer for a URL whose id is unknown at build time (see
 * `RUNTIME_ROUTES`); this screen simply is not one, because nobody needs to link to it.
 *
 * ── Why the picture saves immediately and the text does not ──────────────────
 *
 * Because that is what each one *is*. Choosing a photo is a completed decision — there is no
 * half-chosen picture, and a Save that also had to be pressed afterwards would leave the new
 * image on screen in a state indistinguishable from saved. Typing a name is not: it passes
 * through every prefix of itself, and saving per keystroke would write "H", "Ho", "Hol" to a
 * column the switcher renders live. Save stays disabled until something actually changed,
 * which is what makes the split legible rather than arbitrary.
 */

/* The two editable fields. Same shape as the composer's schema, and the messages are written
 * to be read out loud by <FormMessage/> under the field that caused them — which is why the
 * limits live here rather than as an `if` in the submit handler. The server enforces the same
 * two ceilings in `updateOrg`; these exist so a refusal arrives before a round trip. */
const schema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Enter a name for this group.")
        .max(MAX_ORG_NAME_LENGTH, `Keep the name under ${MAX_ORG_NAME_LENGTH} characters.`),
    bio: z
        .string()
        .trim()
        .max(MAX_ORG_BIO_LENGTH, `Keep the description under ${MAX_ORG_BIO_LENGTH} characters.`),
})

const OrgForm = ({ org, save, saving, onDelete, onDirtyChange, onDone }) => {
    /* react-hook-form + zod through the `Form` primitives, exactly as the composer does it —
     * `<FormLabel/>` owns the label/`htmlFor` pairing, `<FormControl/>` wires `aria-describedby`
     * and `aria-invalid`, and `<FormMessage/>` renders the resolver's message under the field.
     * Hand-rolling those was duplicating a solved problem and quietly losing the accessibility
     * plumbing that comes with them.
     *
     * **The parent keys this on `org.id`**, so editing a different group mounts a fresh form
     * rather than needing an effect to re-seed one. `defaultValues` is therefore read once and
     * is always the right group's — and a save, which replaces the org object but not its id,
     * leaves the mounted form alone instead of yanking fields out from under the next edit. */
    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: { name: org.name ?? "", bio: org.bio ?? "" },
    })

    /* `useWatch` rather than `form.watch(...)`: the latter hands back a function the React
     * compiler cannot memoize safely, so it bails out of optimizing this whole component. */
    const name = useWatch({ control: form.control, name: "name" }) ?? ""
    const bio = useWatch({ control: form.control, name: "bio" }) ?? ""

    const trimmedName = name.trim().replace(/\s+/g, " ")
    const trimmedBio = bio.trim()

    /* Nothing to save until something moved, so Save is dark until it means something. */
    const changed = trimmedName !== (org.name ?? "") || trimmedBio !== (org.bio ?? "")

    /* Told to the parent so a stray backdrop click cannot silently discard a half-typed name
     * — the same guard the composer puts on an unfinished post, reported the same way. */
    useEffect(() => {
        onDirtyChange?.(changed)
    }, [changed, onDirtyChange])

    const submit = form.handleSubmit(
        async (values) => {
            const nextName = values.name.trim().replace(/\s+/g, " ")
            const nextBio = values.bio.trim()

            /* Only what moved. The server treats an absent field as "leave alone", so a
             * picture changed a moment ago is not re-sent and cannot be clobbered by a stale
             * value this form happened to be holding. */
            const changes = {}
            if (nextName !== (org.name ?? "")) changes.name = nextName
            if (nextBio !== (org.bio ?? "")) changes.bio = nextBio
            if (Object.keys(changes).length === 0) return

            if (await save(changes)) {
                /* Settle onto what was actually stored — collapsed whitespace, a trimmed bio —
                 * so the form stops reporting an unsaved change it no longer has and the dirty
                 * guard lifts before the surface closes. */
                form.reset({ name: nextName, bio: nextBio })
                toast.success("Group updated.")
                onDone?.()
            }
        },
        /* Validation is toasted as well as rendered, matching the composer: inside a sheet the
         * field that failed can be scrolled out of view, and a Save that appears to do nothing
         * is worse than a message in the wrong place. */
        (errors) => {
            const first = Object.values(errors).find((error) => error?.message)?.message
            if (first) toast.error(first)
        },
    )

    const onPicture = async (url) => {
        if (await save({ avatar: url })) toast.success("Group picture updated.")
    }

    return (
        <Form {...form}>
            {/* Every structural class here is the composer's, deliberately — the two surfaces
             * are the same object to the reader (a sheet you act in and dismiss), and the
             * moment their padding, gaps or footers drift they stop reading as one system.
             *
             * `data-vaul-no-drag` is the one that is load-bearing rather than cosmetic: Vaul
             * treats the whole drawer as a drag handle, so without it a touch that starts in
             * the name field swipes the sheet shut instead of focusing the input. */}
            <form
                onSubmit={submit}
                data-vaul-no-drag
                className="flex min-h-0 flex-1 flex-col"
            >
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4">
                    {/* The picture and the group's identity, above the fields — the same place
                        the composer puts the thing the post is about. */}
                    <header className="flex flex-col items-center gap-3 pt-1 text-center">
                        <OrgAvatarPicker
                            org={org}
                            onUploaded={onPicture}
                            saving={saving}
                            className="size-24"
                        />
                        <h3 className="text-2xl font-semibold text-foreground">
                            {org.name}
                        </h3>
                    </header>

                    <div className="flex flex-col gap-5 border-t pt-5">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Holy Trinity Cathedral"
                                            autoComplete="off"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Shown in the group switcher and on every post.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="bio"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="Announcements, feasts, and parish life."
                                            rows={3}
                                            className="resize-none min-h-19"
                                            {...field}
                                        />
                                    </FormControl>
                                    {/* The counter takes over from the hint only in the last
                                        stretch. A number counting down from 280 beside an empty
                                        box is an instruction to write more. */}
                                    <FormDescription>
                                        {trimmedBio.length > MAX_ORG_BIO_LENGTH - 40
                                            ? `${MAX_ORG_BIO_LENGTH - trimmedBio.length} characters left`
                                            : "Optional. A sentence about this group."}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                </div>

                {/* The composer's footer, class for class: full-width on a phone where it sits
                    above the keyboard, and a wide pill aligned right on a desktop.

                    Delete lives here beside Save rather than in a section of its own. The two
                    are the only things you can do from this form, so they belong in the same
                    place — and `flex-1` on both is what makes them the same width on a phone,
                    which a full-width Save above a smaller Delete conspicuously was not. */}
                <div className="flex shrink-0 gap-2 border-t px-4 py-3 sm:justify-end">
                    {onDelete && (
                        <Button
                            type="button"
                            variant="destructive"
                            size="lg"
                            onClick={onDelete}
                            className="flex-1 sm:flex-none sm:px-8"
                        >
                            Delete group
                        </Button>
                    )}
                    <Button
                        type="submit"
                        size="lg"
                        disabled={!changed || saving}
                        className="flex-1 sm:flex-none sm:px-10"
                    >
                        {saving ? (
                            <Ripple
                                aria-label="Saving group settings"
                                className="size-8 [&_circle]:stroke-current"
                            />
                        ) : (
                            "Save"
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    )
}

/* Confirming the deletion — a dialog over the editor, armed only once the group is named.
 *
 * ── Who ever sees it ────────────────────────────────────────────────────────
 *
 * `canDelete` comes from the server (`canDeleteOrg`) and is narrower than the `canEdit` that
 * drew the rest of the form: the platform owner **who created this group**, and nobody else.
 * A parish priest administering the group he was given can rename it and cannot destroy it,
 * and the launch parish — written by the seed, with no `createdById` — can be destroyed by no
 * one. Composed server-side rather than re-derived here, so the button cannot be offered for
 * an action that would then 403.
 *
 * ── Typing the name ─────────────────────────────────────────────────────────
 *
 * The API's own guard is the *slug* echoed back, which is the stable key and the right thing
 * on the wire. It is also a string this app never shows anybody, so asking a human for it
 * would be asking them to confirm with something they have never seen. The name is what is on
 * screen, so the name is what is asked for; the store sends the slug once it matches. One
 * guard, expressed in the currency each side actually holds.
 *
 * ── Why not `<ConfirmDialog/>` ──────────────────────────────────────────────
 *
 * The shared one in `Widgets.jsx` is a title, a sentence and two buttons, and deleting a post
 * wants exactly that. This needs three things it has not got: a field to type the name into, a
 * confirm that stays disabled until the name matches, and a pending state for a call that
 * cascades across a whole parish. Adding all three there would put the machinery in front of
 * the simple case that is its only other caller.
 *
 * ── Rendered as a sibling of the editor, not inside it ──────────────────────
 *
 * On a phone the editor is a Vaul drawer, and a modal nested in another modal's subtree
 * inherits its focus trap and its scroll lock. Both are portalled to the body, so keeping them
 * siblings lets this one stack cleanly on top and be dismissed on its own. */
const DeleteOrgDialog = ({ org, open, onOpenChange, onConfirm, deleting }) => {
    const [typed, setTyped] = useState("")

    const matches = typed.trim() === org.name.trim()

    /* Cleared on the way out rather than in an effect on the way in, so reopening never
     * presents a confirmation that is already armed and nothing sets state during a render. */
    const change = (next) => {
        if (!next) setTyped("")
        onOpenChange(next)
    }

    return (
        <Dialog open={open} onOpenChange={deleting ? undefined : change}>
            <DialogContent className="sm:max-w-md" showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>Delete {org.name}?</DialogTitle>
                    <DialogDescription>
                        Every post, comment and membership in this group is removed for
                        everyone, permanently. This cannot be undone.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-2">
                    {/* Outside the `Form` primitives deliberately: this is not a field of the
                        group being edited but the confirmation for a different action, and
                        putting it on that form's `react-hook-form` instance would make an
                        abandoned delete count as an unsaved change to the name. Its label is
                        wired by hand for the same reason — there is no FormField to own it. */}
                    <label
                        htmlFor="confirm-delete-group"
                        className="text-sm text-muted-foreground"
                    >
                        Type <span className="font-semibold text-foreground">{org.name}</span>{" "}
                        to confirm.
                    </label>
                    <Input
                        id="confirm-delete-group"
                        value={typed}
                        onChange={(event) => setTyped(event.target.value)}
                        placeholder={org.name}
                        autoComplete="off"
                        disabled={deleting}
                    />
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        size="lg"
                        disabled={deleting}
                        onClick={() => change(false)}
                        className="w-full sm:w-fit sm:px-8"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        size="lg"
                        disabled={!matches || deleting}
                        onClick={onConfirm}
                        className="w-full sm:w-fit sm:px-8"
                    >
                        {deleting ? (
                            <Ripple
                                aria-label="Deleting this group"
                                className="size-8 [&_circle]:stroke-current"
                            />
                        ) : (
                            "Delete forever"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/* Shown when the group stops resolving while the surface is open — a membership revoked
 * mid-edit. One screen for both that and an unknown id: telling someone with no membership
 * that a particular group *exists* is the leak the API's 404-over-403 rule avoids. */
const Unavailable = () => (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-16 text-center">
        <h3 className="text-lg font-semibold text-foreground">Group unavailable</h3>
        <p className="text-sm text-muted-foreground">
            You’re no longer one of this group’s administrators.
        </p>
    </div>
)

/* Mounted once by the protected shell. Both entrances — the gear on a hovered switcher row
 * and the mobile panel's hold menu — set `editingId` in the org store, and this draws it.
 *
 * Crossing the breakpoint swaps dialog for sheet, and anything typed is lost in that moment.
 * That is a rotation mid-edit on a tablet and nothing else; holding the draft in a store to
 * survive it would be state with one purpose and a lifetime nobody could name — the same
 * call the composer makes. */
const OrgEditor = () => {
    const { open, close, org, save, saving, remove, deleting, canEdit, canDelete } =
        useOrgEditor()
    const [dirty, setDirty] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const isDesktop = useIsDesktop()

    /* React state, not a URL, so Android's back gesture has nothing to unwind and would
     * otherwise close the app from on top of the surface. */
    useBackHandler(open, close)

    const onOpenChange = useCallback(
        (next) => {
            if (!next) {
                setDirty(false)
                close()
            }
        },
        [close],
    )

    /* Both surfaces close on success, so the confirmation has to be a toast — there is nothing
     * left on screen to put it on. The name is captured before the call, because the row is
     * gone from `user.orgs` by the time it resolves. A failure leaves the confirmation standing
     * on a group that still exists, which is the honest thing to show. */
    const onDelete = useCallback(async () => {
        const name = org?.name
        if (await remove()) {
            setConfirming(false)
            toast.success(`${name} deleted.`)
        }
    }, [remove, org])

    /* Declines a dismissal that would discard an unsaved name. Passed to the dialog's
     * outside-press and Escape handlers; the drawer needs no equivalent, because a swipe down
     * is itself a deliberate gesture rather than a stray click. */
    const guard = useCallback(
        (event) => {
            if (dirty) event.preventDefault()
        },
        [dirty],
    )

    const body =
        org && canEdit ? (
            <OrgForm
                key={org.id}
                org={org}
                save={save}
                saving={saving}
                /* Absent rather than false when the viewer may not delete, so the footer has
                   nothing to render instead of a button that hides itself. */
                onDelete={canDelete ? () => setConfirming(true) : null}
                onDone={() => onOpenChange(false)}
                onDirtyChange={setDirty}
            />
        ) : (
            <Unavailable />
        )

    /* A sibling of the editor rather than a child of it — see the header of
     * <DeleteOrgDialog/>. Mounted only when there is a group to name, so it never renders a
     * title with a hole in it. */
    const confirmation = org && canDelete && (
        <DeleteOrgDialog
            org={org}
            open={confirming}
            onOpenChange={setConfirming}
            onConfirm={onDelete}
            deleting={deleting}
        />
    )

    if (isDesktop) {
        return (
            <>
                <Dialog open={open} onOpenChange={onOpenChange}>
                    <DialogContent
                        className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-lg"
                        onPointerDownOutside={guard}
                        onEscapeKeyDown={guard}
                    >
                        {/* Announced, not shown: the group's own name and picture are the
                            visible heading, and Radix warns when a dialog has no title. */}
                        <DialogHeader className="sr-only">
                            <DialogTitle>Group settings</DialogTitle>
                            <DialogDescription>
                                Change this group’s name, description and picture.
                            </DialogDescription>
                        </DialogHeader>
                        {body}
                    </DialogContent>
                </Dialog>
                {confirmation}
            </>
        )
    }

    /* repositionInputs is off for the same reason the composer turns it off: Vaul keeps a
     * mobile-Safari scroll lock installed that hand-focuses inputs, and that focus does not
     * take inside the Capacitor WebView — the field looks dead. Keeping the submit above the
     * keyboard is KeyboardAwareColumn's job instead. */
    return (
        <>
            <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
                {/* dvh, not vh: on a mobile browser vh is the tall viewport, so the sheet's
                    foot would sit under the browser's own toolbar. */}
                <DrawerContent className="h-[90dvh] max-h-[90dvh]">
                    <KeyboardAwareColumn>
                        {/* A sheet arrives from off-screen with none of a dialog's framing, so
                            it keeps its name where the desktop can leave it to the group's
                            own. */}
                        <DrawerHeader className="shrink-0 border-b pt-2 pb-4">
                            <DrawerTitle className="text-center font-semibold">
                                Group settings
                            </DrawerTitle>
                        </DrawerHeader>
                        {/* Mounted only while open, so the draft is seeded fresh each time
                            rather than kept alive behind a closed sheet. */}
                        {open && body}
                    </KeyboardAwareColumn>
                </DrawerContent>
            </Drawer>
            {confirmation}
        </>
    )
}

export default OrgEditor
