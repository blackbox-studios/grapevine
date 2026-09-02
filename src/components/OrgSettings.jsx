"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import Ripple from "@/assets/svg/ripple.svg"
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
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { MAX_ORG_BIO_LENGTH, MAX_ORG_NAME_LENGTH } from "@/lib/constants"
import { useOrgSettings } from "@/lib/store/org/hook"

/* Group settings: a parish's own name, description and picture, and the danger zone that
 * retires it.
 *
 * **The group tree mirrors the account tree, and that parallel is the design.** `/settings`
 * asks about the person — picture, name, standing, then Info and General; `/group` asks the
 * same shape about a parish — picture, name, your role in it, then Info and Users. A reader who
 * has used one already knows how to read the other, and every destination is a row on a list
 * rather than a surface reached from a menu.
 *
 * **Admin-only, and gated once in the layout** rather than per page — the whole tree answers to
 * the same question, and a gate per page is a gate somebody forgets on the next page. The form
 * still checks `canEdit` for itself, because a role can be revoked while the page is open.
 *
 * `slug` and `kind` are not editable and never will be from here: the slug is the seeds'
 * natural key and the only stable handle anything outside the database has on a group, and
 * `kind` is a classification that grants nothing and that no screen renders. See
 * `prisma/schema.prisma`.
 */

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

const OrgForm = ({ org, save, saving, onDelete, onCancel }) => {
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
            }
        },
        /* Validation is toasted as well as rendered, matching the composer: the field that
         * failed can be scrolled out of view, and a Save that appears to do nothing is worse
         * than a message in the wrong place. */
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
            <form onSubmit={submit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-5">
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

                {/* **Save is first in the DOM and last on a desktop, and that is the whole
                    layout.** A phone reads the column top-down, so the thing the reader came to
                    do belongs at the top of it and the destructive one at the bottom, behind a
                    rule that says "different kind of action". A desktop reads a row left-to-
                    right, so `order` puts Delete back at the far left with `mr-auto` holding
                    the other two against the right edge — away from the pair you actually came
                    for, which is the same separation the rule draws on a phone.

                    Cancel is here rather than only on the back arrow: that arrow is a phone's
                    affordance and is hidden from md up, so without this a desktop reader has no
                    way out of the form but the nav rail. */}
                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:gap-2">
                    <Button
                        type="submit"
                        size="lg"
                        disabled={!changed || saving}
                        className="order-1 w-full sm:order-3 sm:w-auto sm:px-10"
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

                    <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={onCancel}
                        disabled={saving}
                        className="order-2 w-full sm:w-auto sm:px-8"
                    >
                        Cancel
                    </Button>

                    {onDelete && (
                        <>
                            <Separator className="order-3 my-1 sm:hidden" />
                            <Button
                                type="button"
                                variant="destructive"
                                size="lg"
                                onClick={onDelete}
                                className="order-4 w-full sm:order-1 sm:mr-auto sm:w-auto sm:px-8"
                            >
                                Delete group
                            </Button>
                        </>
                    )}
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

/* The group's own details, as the body of `/group/info`.
 *
 * A page, because it is one row of a settings tree rather than something you act in over the
 * top of the app — and a page has no backdrop, so there is no stray-click dismissal for a
 * half-typed name to be guarded against.
 *
 * The delete confirmation is a dialog, because that *is* a thing you act in and dismiss, and it
 * is a sibling of the form rather than a child, so it owns its own focus trap. */
const OrgSettings = () => {
    const { org, save, saving, remove, deleting, canEdit, canDelete } = useOrgSettings()
    const [confirming, setConfirming] = useState(false)
    const router = useRouter()

    /* Both the group and the page it was reached from are gone once this succeeds, so the
     * confirmation has to be a toast. The name is captured before the call, because the row is
     * off `user.orgs` by the time it resolves. A failure leaves the dialog standing on a group
     * that still exists, which is the honest thing to show. */
    const onDelete = useCallback(async () => {
        const name = org?.name
        if (await remove()) {
            setConfirming(false)
            toast.success(`${name} deleted.`)
        }
    }, [remove, org])

    if (!org || !canEdit) return <Unavailable />

    return (
        <>
            <OrgForm
                key={org.id}
                org={org}
                save={save}
                saving={saving}
                /* Absent rather than false when the viewer may not delete, so the footer has
                   nothing to render instead of a button that hides itself. */
                onDelete={canDelete ? () => setConfirming(true) : null}
                onCancel={() => router.back()}
            />

            {canDelete && (
                <DeleteOrgDialog
                    org={org}
                    open={confirming}
                    onOpenChange={setConfirming}
                    onConfirm={onDelete}
                    deleting={deleting}
                />
            )}
        </>
    )
}

export default OrgSettings
