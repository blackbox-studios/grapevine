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

const OrgForm = ({ org, save, saving, onDelete, deleting, onDirtyChange, onDone }) => {
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

                    {onDelete && (
                        <DangerZone org={org} onDelete={onDelete} deleting={deleting} />
                    )}
                </div>

                {/* The composer's footer, class for class: full-width on a phone where it sits
                    above the keyboard, and a wide pill aligned right on a desktop. */}
                <div className="shrink-0 border-t px-4 py-3 sm:flex sm:justify-end">
                    <Button
                        type="submit"
                        size="lg"
                        disabled={!changed || saving}
                        className="w-full sm:w-fit sm:px-10"
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

/* Destroying the group, at the foot of its own settings — the conventional place, and the
 * conventional shape: collapsed to a single destructive button, expanded to a confirmation
 * that will not arm until the group has been named.
 *
 * ── Who sees it ─────────────────────────────────────────────────────────────
 *
 * `canDelete` comes from the server (`canDeleteOrg`) and is narrower than the `canEdit` that
 * drew the rest of this form: the platform owner **who created this group**, and nobody else.
 * A parish priest administering the group he was given can rename it and cannot destroy it,
 * and the launch parish — created by the seed, with no `createdById` — can be destroyed by no
 * one. Composed server-side rather than re-derived here so the button cannot appear for an
 * action that would then 403.
 *
 * ── Typing the name ─────────────────────────────────────────────────────────
 *
 * The API's own guard is the *slug* echoed back, which is the stable key and the right thing
 * on the wire. It is also a string this app never shows anybody, so asking a human for it
 * would be asking them to confirm with something they have never seen. The name is what is on
 * screen, so the name is what is asked for; the store sends the slug once it matches. Same
 * guard, expressed in the currency each side actually holds.
 *
 * Collapsed by default, because an always-open box with a destructive button in it is
 * something to be misclicked on the way to Save. */
const DangerZone = ({ org, onDelete, deleting }) => {
    const [open, setOpen] = useState(false)
    const [typed, setTyped] = useState("")

    const matches = typed.trim() === org.name.trim()

    if (!open) {
        return (
            <div className="flex flex-col gap-2 border-t border-destructive/30 pt-5">
                <h4 className="text-sm font-semibold text-destructive">Danger zone</h4>
                <p className="text-sm text-muted-foreground">
                    Deleting this group removes its posts, comments and members for everyone.
                    This cannot be undone.
                </p>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(true)}
                    className="w-fit border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                    Delete this group
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3 border-t border-destructive/30 pt-5">
            <h4 className="text-sm font-semibold text-destructive">Delete {org.name}</h4>
            <p className="text-sm text-muted-foreground">
                Type <span className="font-semibold text-foreground">{org.name}</span> to
                confirm. Every post, comment and membership in this group is removed for
                everyone, permanently.
            </p>
            {/* Outside the `Form` primitives deliberately: this is not a field of the group
                being edited, it is a confirmation for a different action, and putting it on
                the same `react-hook-form` instance would make an unfinished delete count as
                an unsaved change to the *name*. Its own label is wired by hand for the same
                reason — there is no FormField to own the pairing. */}
            <label htmlFor="confirm-delete-group" className="sr-only">
                Type the group name to confirm deletion
            </label>
            <Input
                id="confirm-delete-group"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={org.name}
                autoComplete="off"
                disabled={deleting}
            />
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="destructive"
                    disabled={!matches || deleting}
                    onClick={onDelete}
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
                <Button
                    type="button"
                    variant="ghost"
                    disabled={deleting}
                    onClick={() => {
                        setOpen(false)
                        setTyped("")
                    }}
                >
                    Cancel
                </Button>
            </div>
        </div>
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

    /* The dialog closes on success, so the confirmation has to be a toast — there is no
     * surface left to show it on. The name is captured before the call, because the row is
     * gone from `user.orgs` by the time it resolves. */
    const onDelete = useCallback(async () => {
        const name = org?.name
        if (await remove()) toast.success(`${name} deleted.`)
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
                /* Absent rather than false when the viewer may not delete, so the form has
                   nothing to render instead of a section that hides itself. */
                onDelete={canDelete ? onDelete : null}
                deleting={deleting}
                onDone={() => onOpenChange(false)}
                onDirtyChange={setDirty}
            />
        ) : (
            <Unavailable />
        )

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-lg"
                    onPointerDownOutside={guard}
                    onEscapeKeyDown={guard}
                >
                    {/* Announced, not shown: the group's own name and picture are the visible
                        heading, and Radix warns when a dialog has no title. */}
                    <DialogHeader className="sr-only">
                        <DialogTitle>Group settings</DialogTitle>
                        <DialogDescription>
                            Change this group’s name, description and picture.
                        </DialogDescription>
                    </DialogHeader>
                    {body}
                </DialogContent>
            </Dialog>
        )
    }

    return (
        /* repositionInputs is off for the same reason the composer turns it off: Vaul keeps a
         * mobile-Safari scroll lock installed that hand-focuses inputs, and that focus does not
         * take inside the Capacitor WebView — the field looks dead. Keeping the submit above
         * the keyboard is KeyboardAwareColumn's job instead. */
        <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
            {/* dvh, not vh: on a mobile browser vh is the tall viewport, so the sheet's foot
                would sit under the browser's own toolbar. */}
            <DrawerContent className="h-[90dvh] max-h-[90dvh]">
                <KeyboardAwareColumn>
                    {/* A sheet arrives from off-screen with none of a dialog's framing, so it
                        keeps its name where the desktop can leave it to the group's own. */}
                    <DrawerHeader className="shrink-0 border-b pt-2 pb-4">
                        <DrawerTitle className="text-center font-semibold">
                            Group settings
                        </DrawerTitle>
                    </DrawerHeader>
                    {/* Mounted only while open, so the draft is seeded fresh each time rather
                        than kept alive behind a closed sheet. */}
                    {open && body}
                </KeyboardAwareColumn>
            </DrawerContent>
        </Drawer>
    )
}

export default OrgEditor
