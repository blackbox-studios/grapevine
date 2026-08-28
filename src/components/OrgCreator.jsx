"use client"

import { useCallback, useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import Ripple from "@/assets/svg/ripple.svg"
import { KeyboardAwareColumn } from "@/components/KeyboardAware"
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
import { useOrgCreator } from "@/lib/store/org/hook"

/* Creating a group — a dialog on a desktop, a bottom sheet on a phone.
 *
 * **Every structural decision here is <OrgEditor/>'s, on purpose.** The two are one surface to
 * the reader — you act in it and dismiss it — so they share the dialog/drawer split, the
 * scroll-and-footer layout, the dirty guard, and the `data-vaul-no-drag` that keeps a touch in
 * a text field from swiping the sheet shut. Read that component's header for why this is
 * component state rather than a route, and why Android's back gesture depends on it.
 *
 * ── Who sees it ──────────────────────────────────────────────────────────────
 *
 * Platform owners, and only them. That is the subscriber's axis — a third one, held by the
 * person rather than granted inside any group, because the group being created does not exist
 * yet. The entrance is a row at the foot of the switcher; `requirePlatformOwner` on the server
 * is what actually enforces it, and this surface checks `canCreate` again because ownership can
 * be revoked while it is open.
 *
 * ── Two fields, and the three that are absent ────────────────────────────────
 *
 * **No picture.** An avatar upload is authorized by an ADMIN membership in the group and lands
 * in a folder named after its id — neither of which exists until the group is saved. Group
 * settings opens on the new group a tap later and sets one in a single call, so that is where
 * it stays; this form only has to get the group *made*.
 *
 * **No slug.** Derived from the name by the server and never shown anywhere in the app, so
 * asking for it would be asking someone naming a parish to care about a URL. It is also
 * permanent, which is a bad thing to make somebody guess at while they are still typing the
 * name it comes from.
 *
 * **No type.** `OrgKind` grants nothing and nothing branches on it — every group behaves
 * identically — so asking would be asking for a decision with no consequence, on a field that
 * cannot be corrected afterwards. The server defaults to GROUP.
 */

/* Bounds mirrored from the server (`createOrg`), so a refusal arrives before a round trip
 * rather than after one. */
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

const CreateForm = ({ create, saving, onDirtyChange }) => {
    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: { name: "", bio: "" },
    })

    /* `useWatch` rather than `form.watch(...)`: the latter hands back a function the React
     * compiler cannot memoize safely, so it bails out of optimizing this whole component. */
    const name = useWatch({ control: form.control, name: "name" }) ?? ""
    const bio = useWatch({ control: form.control, name: "bio" }) ?? ""

    const trimmedName = name.trim()
    const trimmedBio = bio.trim()

    /* Anything typed counts as a draft worth guarding a stray backdrop click against — the
     * same protection the editor and the composer give an unfinished one, reported the same
     * way. In an effect, not in render: this sets state in the parent. */
    const dirty = trimmedName.length > 0 || trimmedBio.length > 0
    useEffect(() => {
        onDirtyChange?.(dirty)
    }, [dirty, onDirtyChange])

    const submit = form.handleSubmit(
        async (values) => {
            const org = await create({
                name: values.name.trim().replace(/\s+/g, " "),
                bio: values.bio.trim(),
            })
            /* The hook selects the new group and closes the surface, so there is nothing to
             * reset — this form unmounts. A failure leaves it standing with what was typed
             * still in it, which is the only reason the error is not also toasted here: the
             * store's error surfaces through the global listener. */
            if (org) toast.success(`${org.name} created.`)
        },
        /* Toasted as well as rendered, matching the composer and the editor: inside a sheet
         * the field that failed can be scrolled out of view, and a Create that appears to do
         * nothing is worse than a message in the wrong place. */
        (errors) => {
            const first = Object.values(errors).find((error) => error?.message)?.message
            if (first) toast.error(first)
        },
    )

    return (
        <Form {...form}>
            <form
                onSubmit={submit}
                data-vaul-no-drag
                className="flex min-h-0 flex-1 flex-col"
            >
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Name</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="Catechumens"
                                        autoComplete="off"
                                        autoFocus
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
                                        placeholder="Inquirers and catechumens preparing for reception."
                                        rows={3}
                                        className="resize-none min-h-19"
                                        {...field}
                                    />
                                </FormControl>
                                {/* The counter takes over from the hint only in the last
                                    stretch — a number counting down beside an empty box is an
                                    instruction to write more. */}
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

                <div className="shrink-0 border-t px-4 py-3 sm:flex sm:justify-end">
                    <Button
                        type="submit"
                        size="lg"
                        disabled={!trimmedName || saving}
                        className="w-full sm:w-fit sm:px-10"
                    >
                        {saving ? (
                            <Ripple
                                aria-label="Creating group"
                                className="size-8 [&_circle]:stroke-current"
                            />
                        ) : (
                            "Create group"
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    )
}

/* Shown if ownership is revoked while the surface is open. The same shape as the editor's
 * `Unavailable`, and there for the same reason: the entrance is checked, but a role can move
 * underneath it. */
const NotPermitted = () => (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-16 text-center">
        <h3 className="text-lg font-semibold text-foreground">Can’t create groups</h3>
        <p className="text-sm text-muted-foreground">
            Your account no longer has permission to create groups.
        </p>
    </div>
)

/* Mounted once by the protected shell, beside <OrgEditor/>. Both entrances — the row at the
 * foot of the desktop dropdown and of the mobile panel — set `creating` in the org store. */
const OrgCreator = () => {
    const { open, close, create, saving, canCreate } = useOrgCreator()
    const [dirty, setDirty] = useState(false)
    const isDesktop = useIsDesktop()

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

    /* Declines a dismissal that would discard a half-typed name. Passed to the dialog's
     * outside-press and Escape handlers; the drawer needs no equivalent, because a swipe down
     * is itself a deliberate gesture rather than a stray click. */
    const guard = useCallback(
        (event) => {
            if (dirty) event.preventDefault()
        },
        [dirty],
    )

    const body = canCreate ? (
        <CreateForm create={create} saving={saving} onDirtyChange={setDirty} />
    ) : (
        <NotPermitted />
    )

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-lg"
                    onPointerDownOutside={guard}
                    onEscapeKeyDown={guard}
                >
                    <DialogHeader className="border-b px-4 pb-4 pt-5">
                        <DialogTitle>New group</DialogTitle>
                        <DialogDescription>
                            A news feed for a parish, monastery, or catechumen group
                        </DialogDescription>
                    </DialogHeader>
                    {body}
                </DialogContent>
            </Dialog>
        )
    }

    return (
        /* repositionInputs is off for the same reason the composer and the editor turn it off:
         * Vaul keeps a mobile-Safari scroll lock installed that hand-focuses inputs, and that
         * focus does not take inside the Capacitor WebView — the field looks dead. Keeping the
         * submit above the keyboard is KeyboardAwareColumn's job instead. */
        <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
            {/* dvh, not vh: on a mobile browser vh is the tall viewport, so the sheet's foot
                would sit under the browser's own toolbar. */}
            <DrawerContent className="h-[90dvh] max-h-[90dvh]">
                <KeyboardAwareColumn>
                    <DrawerHeader className="shrink-0 border-b pt-2 pb-4">
                        <DrawerTitle className="text-center font-semibold">
                            New group
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

export default OrgCreator
