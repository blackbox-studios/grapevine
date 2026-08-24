"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import Plus from "@/assets/svg/icons/plus.svg"
import Ripple from "@/assets/svg/ripple.svg"
import { Privileged } from "@/components/Auth"
import Icon from "@/components/Icon"
import { KeyboardAwareColumn } from "@/components/KeyboardAware"
import { Reflow, ReflowItem } from "@/components/Reflow"
import Skeleton from "@/components/Skeleton"
import { Attachment, Avatar, OrgAvatar } from "@/components/Widgets"
import { Button } from "@/components/ui/button"
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
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
} from "@/components/ui/form"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DOCUMENT_MIME_TYPES, MAX_POST_IMAGES, ROLES, UPLOAD_PURPOSES } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"
import { useBackHandler } from "@/lib/hooks/useNative.hook"
import { useUser } from "@/lib/store/auth/hook"
import { usePublish } from "@/lib/store/feed/hook"
import { useUpload } from "@/lib/store/uploads/hook"
import { appPath, cn, documentType, formatBytes } from "@/lib/utils"

/* Writing a post.
 *
 * **The entrance is in the app's chrome, not on the feed**, which is a deliberate move from
 * the card that used to sit at the top of the group's posts. A composer that lives inside
 * one group can only ever write to that group, and it is in the way of the reading the rest
 * of the surface is for. In the nav it is available from anywhere, and it belongs to the
 * viewer rather than to the group they happen to be looking at — which is what lets it ask
 * which group to publish into rather than assuming.
 *
 * That is also why the gate is `<Privileged anyOrg/>` and not the per-group one every other
 * admin control uses: the button is above the switcher. An admin of one parish reading their
 * diocese still has somewhere to post, and the composer's own dropdown is where that is
 * settled. Presentation either way — `requireMembership(..., { role: "ADMIN" })` runs on the
 * target group before anything is written, so a member who calls the endpoint gets a 403
 * whether or not this was ever rendered.
 *
 * Two presentations of the same form, on the same split as the post surface it will produce:
 * a centered dialog on a pointer device, a bottom sheet on a phone. */

/* Long enough for "Great Vespers and Confessions this Saturday" and short enough that it
 * stays one line on a feed card, which is the only place it is rendered. */
const TITLE_MAX = 120

const schema = z.object({
    orgId: z.string().min(1, "Choose a group to post in."),
    title: z.string().trim().max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters.`),
    body: z.string().trim().min(1, "Write something to post."),
})

/* -------------------------------------------------------------------------- */
/* Photos                                                                     */
/* -------------------------------------------------------------------------- */

/* The geometry every tile in the strip shares — a **fixed** box, not one the photo decides.
 *
 * Letting each tile take its photo's own width is what made the strip lurch during an upload:
 * the skeleton could only guess an aspect ratio, so every photo that landed resized its tile
 * and shoved the rest of the row sideways. A constant box is knowable before the bytes are,
 * so the skeleton occupies exactly the space its photo will, and the arriving photo simply
 * appears. The trade is that a tile crops rather than showing the whole frame — acceptable
 * here, because this control is for editing the set, and the card downstream shows each photo
 * whole. Smaller inside the desktop dialog, which has less of the viewport to spend. */
const TILE = "size-36 shrink-0 rounded-xl sm:size-32"

/* Just the tile's height, for the empty state's plate.
 *
 * **Both states of the strip occupy exactly the same box**, or the first photo drops
 * everything below it — the title, the caption, the Post button — by the difference. So the
 * plate is one tile tall and neither branch carries any padding of its own; a scroll gutter on
 * the strip alone was the height that leaked. Change one of these two and change the other. */
const TILE_HEIGHT = "h-36 sm:h-32"

/* The picked photos, as one horizontally scrolling line.
 *
 * A line rather than a preview of the finished card: what this control is *for* is editing
 * the set — removing the third of four — and a carousel has no way to say "not that one".
 * The card's own rendering (one photo, or the swipeable carousel) is a `PostCard` concern and
 * stays there; duplicating it here to preview it would be the same layout written twice,
 * drifting apart on the first change to either.
 *
 * It bleeds past the form's gutter (`-mx-4 px-4`), so a photo runs to the screen edge and the
 * next one peeks in behind it — which is what tells a reader there is more to scroll to
 * without a scrollbar having to say so.
 *
 * **Photos are uploaded when they are picked, not when Post is tapped.** By the time the
 * form is submitted every image already has a URL, so publishing is one request and the
 * optimistic row can carry the real photo. The cost is an upload a viewer might discard,
 * which is a few hundred kilobytes in a bucket; the alternative is a Post button that hangs
 * for the length of four uploads with nothing to show for it.
 *
 * Adding and removing move the line through `<Reflow/>` — the same component the comment
 * thread uses, so a photo arrives and a photo leaves exactly the way a comment does. */
const PhotoStrip = ({ media, onRemove, onAdd, pending, disabled }) => {
    const input = useRef(null)
    const full = media.length + pending >= MAX_POST_IMAGES
    const empty = media.length === 0 && pending === 0

    const pick = () => input.current?.click()

    return (
        <div className="flex flex-col gap-2">
            <input
                ref={input}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                    onAdd(event.target.files)
                    /* Cleared so picking the same file twice in a row still fires a
                     * change — the value is what the element compares against. */
                    event.target.value = ""
                }}
            />

            {empty ? (
                /* Nothing picked yet, so the control is the whole invitation: a full-width
                 * plate rather than a button, because at this point adding a photo is the
                 * most likely next thing and a small outline button reads as an aside. */
                <button
                    type="button"
                    onClick={pick}
                    disabled={disabled}
                    className={cn(
                        TILE_HEIGHT,
                        "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
                    )}
                >
                    <Plus className="size-6" />
                    <span className="text-xs font-medium">Add photos</span>
                </button>
            ) : (
                /* `relative` because `<Reflow/>`'s popLayout pulls a leaving tile out of the
                   flow by absolutely positioning it — it needs this box to measure against,
                   or a removed photo animates out from somewhere else entirely.

                   `scrollbar-none` on every platform, not just touch. A classic (non-overlay)
                   scrollbar reserves its height *inside* the scrollport, which would make this
                   branch taller than the plate it replaces on exactly the platforms that have
                   one — the height shift, back again. Nothing is lost: the strip is swiped on
                   a phone and wheel-scrolled on a pointer, and the tile peeking past the edge
                   is what says there is more either way. */
                <div className="relative -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 scrollbar-none">
                    <Reflow>
                        {media.map((item) => (
                            <ReflowItem key={item.url} className={cn(TILE, "relative overflow-hidden")}>
                                <img
                                    src={appPath(item.url)}
                                    alt=""
                                    className="size-full object-cover"
                                />
                                <button
                                    type="button"
                                    onClick={() => onRemove(item.url)}
                                    aria-label="Remove photo"
                                    className="absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
                                >
                                    <Icon size="sm">close</Icon>
                                </button>
                            </ReflowItem>
                        ))}

                        {/* One per upload still in flight, holding the exact box its photo
                          * will land in — which is the whole reason the tile is a fixed size.
                          * Keyed by position because they are indistinguishable; there is
                          * nothing to identify yet. */}
                        {Array.from({ length: pending }, (_, index) => (
                            <ReflowItem key={`uploading-${index}`} className={TILE}>
                                <Skeleton className="size-full rounded-xl" />
                            </ReflowItem>
                        ))}

                        {!full && (
                            <ReflowItem key="add" className={TILE}>
                                <button
                                    type="button"
                                    onClick={pick}
                                    disabled={disabled}
                                    aria-label="Add photos"
                                    className="flex size-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                                >
                                    <Plus className="size-6" />
                                </button>
                            </ReflowItem>
                        )}
                    </Reflow>
                </div>
            )}

            {full && (
                <p className="text-xs text-muted-foreground">
                    That is the most photos one post can carry.
                </p>
            )}
        </div>
    )
}

/* -------------------------------------------------------------------------- */
/* Attachment                                                                 */
/* -------------------------------------------------------------------------- */

/* The one file a post may carry — the sign-up sheet, the schedule, the minutes.
 *
 * A slot rather than a strip, because a post holds exactly one (`MAX_POST_DOCUMENTS`, and the
 * endpoint refuses a second). Picking again replaces what is there, so this is a button until
 * something is attached and the file's own row afterwards.
 *
 * Unlike a photo, the file is uploaded byte for byte — see `prepareFile` in lib/upload.js —
 * so `uploading` here can be a genuinely long wait on a large PDF. It swaps the row for a
 * skeleton of the same height rather than a spinner somewhere else, for the same reason the
 * photo strip does: the space the result will occupy is known, so nothing below moves when it
 * lands. */
const AttachmentSlot = ({ attachment, onAdd, onRemove, uploading, disabled }) => {
    const input = useRef(null)

    return (
        <div className="flex flex-col gap-2">
            <input
                ref={input}
                type="file"
                accept={DOCUMENT_MIME_TYPES.join(",")}
                className="sr-only"
                onChange={(event) => {
                    onAdd(event.target.files)
                    /* Cleared so re-picking the same file still fires a change. */
                    event.target.value = ""
                }}
            />

            {uploading ? (
                <Skeleton className="h-[4.25rem] w-full rounded-lg" />
            ) : attachment ? (
                <Attachment
                    name={attachment.fileName}
                    type={documentType(attachment)}
                    size={formatBytes(attachment.sizeBytes)}
                    onRemove={onRemove}
                />
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => input.current?.click()}
                    className="w-fit"
                >
                    <Icon size="sm">attach_file</Icon>
                    Attach a file
                </Button>
            )}
        </div>
    )
}

/* -------------------------------------------------------------------------- */
/* The form                                                                   */
/* -------------------------------------------------------------------------- */

/* The headline. Its own component because the two surfaces put it in different places and it
 * must be the same field in both — see `heading` on `<ComposeForm/>`.
 *
 * Borderless and auto-growing (`field-sizing-content` comes from the primitive), so it reads
 * as a heading rather than a form control and wraps instead of scrolling sideways out of an
 * input. */
const TitleField = ({ control }) => (
    <FormField
        control={control}
        name="title"
        render={({ field }) => (
            <FormItem>
                <FormLabel className="sr-only">Title</FormLabel>
                <FormControl>
                    <Textarea
                        placeholder="Title (optional)"
                        rows={1}
                        maxLength={TITLE_MAX}
                        className="min-h-0 resize-none border-0 bg-transparent px-0 py-0 text-sm leading-snug font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
                        {...field}
                    />
                </FormControl>
            </FormItem>
        )}
    />
)

/* The composer's fields and its submit, shared verbatim by both presentations.
 *
 * `footer` is where the submit button lands, because that is the one thing the two surfaces
 * place differently: the dialog ends in a right-aligned row, the sheet pins it above the
 * keyboard. Everything above it is identical, which is the point of the split.
 *
 * `onDone` fires only on a successful publish. Failure leaves the surface open with the draft
 * intact — the error is already a toast (`useErrorListener`), and closing over a post that
 * did not happen would lose the writing along with it.
 *
 * **`heading` is where the title field goes, and the two surfaces answer it differently.** In
 * the dialog it stands in for the header: a "New post" label there would only restate the
 * button that was pressed, and a headline is a better use of the one row the reader looks at
 * first. The sheet keeps its "New post" label instead, because on a phone a bottom sheet
 * arriving with no name on it is harder to place — so there the title is simply the first
 * thing in the body, above the group. Same field either way, which is why it is a component
 * rather than two copies. */
const ComposeForm = ({ onDone, onDirtyChange, heading = false }) => {
    const { publish, orgs, defaultOrgId, loading } = usePublish()
    const viewer = useUser()
    const [media, setMedia] = useState([])
    /* The attachment is held apart from `media` rather than in it, because the two are edited
     * by different controls with different rules — a strip of up to ten, and a slot for one.
     * They are joined back into one array at submit, which is the shape the endpoint takes.
     *
     * Named `attachment`, not `document`: a state variable called `document` shadows the
     * global one inside every closure in this component, which is a trap rather than a bug
     * only until someone reaches for `document.createElement`. */
    const [attachment, setAttachment] = useState(null)

    /* Two in-flight counts rather than the store's one. `useUpload` reports whether *any*
     * upload is running, which is the right gate for the Post button and the wrong one for
     * these controls: a photo uploading would otherwise put a skeleton in the attachment slot
     * and vice versa, each claiming to be waiting on the other's file. */
    const [uploadingPhotos, setUploadingPhotos] = useState(0)
    const [attaching, setAttaching] = useState(false)

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: { orgId: defaultOrgId ?? "", title: "", body: "" },
    })

    /* `useWatch` rather than `form.watch(...)`: the latter hands back a function the React
     * compiler cannot memoize safely, so it bails out of optimizing this whole component. */
    const orgId = useWatch({ control: form.control, name: "orgId" })
    const body = useWatch({ control: form.control, name: "body" })

    /* The viewer's groups arrive with `GET /api/me`, which may land after this mounts — and
     * a select whose only option appeared a beat later must not still be showing nothing. */
    useEffect(() => {
        if (!orgId && defaultOrgId) form.setValue("orgId", defaultOrgId)
    }, [orgId, defaultOrgId, form])

    /* Uploads are scoped to the group being posted into, so the permission checked when the
     * URL is minted is the same one the publish will check. Switching groups mid-draft
     * re-binds it; photos already uploaded into the previous group stay valid and are simply
     * referenced by URL. */
    const { upload, uploading } = useUpload(UPLOAD_PURPOSES.POST_MEDIA, orgId)

    /* The placeholder names the group being written to rather than saying "your group".
     * Publishing is the one thing here that leaves the room, and an admin of two parishes
     * choosing the wrong one from a dropdown they set and forgot has no other reminder — so
     * the prompt says who is about to be spoken to. Falls back to the generic wording only
     * before a selection resolves, which is a frame or two on a cold open. */
    const target = orgs.find(org => org.id === orgId)?.name ?? "your group"

    /* Anything typed or picked is worth protecting from a stray click on the backdrop. */
    const dirty = Boolean(body?.trim()) || media.length > 0 || attachment !== null
    useEffect(() => {
        onDirtyChange?.(dirty)
    }, [dirty, onDirtyChange])

    const addPhotos = useCallback(
        async (files) => {
            const picked = Array.from(files ?? []).slice(0, MAX_POST_IMAGES - media.length)
            if (picked.length === 0) return

            setUploadingPhotos(count => count + picked.length)
            try {
                const added = await upload(picked)
                setMedia(current => [...current, ...added])
            } finally {
                setUploadingPhotos(count => Math.max(0, count - picked.length))
            }
        },
        [upload, media.length],
    )

    const removePhoto = useCallback((url) => {
        setMedia(current => current.filter(item => item.url !== url))
    }, [])

    /* One attachment, so picking a second **replaces** the first rather than being refused.
     * Somebody reaching for the file button while one is already attached is correcting it,
     * not trying to add another — and a disabled control with no explanation is a worse answer
     * than doing the obvious thing. The one they discard stays in the bucket, which is the
     * same trade the photo strip already makes. */
    const addFile = useCallback(
        async (files) => {
            const [picked] = Array.from(files ?? [])
            if (!picked) return

            setAttaching(true)
            try {
                const [attached] = await upload([picked])
                if (attached) setAttachment(attached)
            } finally {
                setAttaching(false)
            }
        },
        [upload],
    )

    /* One gate for the button and the submit handler, so the two cannot drift. Uploading is
     * on it because a post published mid-upload would silently drop the photo still in
     * flight. */
    const disabled = useMemo(
        () => loading || uploading || orgs.length === 0,
        [loading, uploading, orgs.length],
    )

    const submit = form.handleSubmit(
        async (values) => {
            if (disabled) return
            const post = await publish({
                orgId: values.orgId,
                /* The title is one line wherever it is rendered, so any break typed into it
                 * is flattened to a space here rather than stored and silently collapsed by
                 * the browser later — what is saved should be what a reader will see. The
                 * body keeps its breaks: they are the author's, and every surface that
                 * renders one now preserves them (see <Caption/> in components/Feed.jsx). */
                title: values.title.replace(/\s+/g, " ").trim() || null,
                body: values.body.trim(),
                /* The photos and the attachment become one media array here — array order is
                 * carousel order, so the attachment goes last where it cannot displace a
                 * photo's position. `projectMedia` splits them apart again by `kind`. */
                media: attachment ? [...media, attachment] : media,
            })
            if (!post) return
            form.reset({ orgId: values.orgId, title: "", body: "" })
            setMedia([])
            setAttachment(null)
            onDone()
        },
        /* **Validation is toasted here rather than rendered under the field**, which is the
         * one place this form departs from the project's `<FormMessage/>` convention. The
         * fields are borderless writing surfaces with no boxes to hang a message off, and a
         * line of red text appearing under the caption pushes the photo strip down the moment
         * someone taps Post. One toast, the first problem — a form this short has nothing to
         * gain from listing them. */
        (errors) => {
            const first = Object.values(errors).find(error => error?.message)?.message
            if (first) toast.error(first)
        },
    )

    return (
        <Form {...form}>
            {/* Vaul treats the whole drawer as a drag handle, so without this a touch that
              * starts in a field — reaching for it, or dragging to select text in a
              * half-written post — swipes the sheet shut instead. */}
            <form
                onSubmit={submit}
                data-vaul-no-drag
                className="flex min-h-0 flex-1 flex-col"
            >
                {heading && (
                    <div className="shrink-0 border-b px-4 py-3.5">
                        <TitleField control={form.control} />
                    </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4">
                    {!heading && <TitleField control={form.control} />}

                    <FormField
                        control={form.control}
                        name="orgId"
                        render={({ field }) => (
                            <FormItem>
                                {/* No visible label: the trigger shows the group's mark and
                                    name, which says what it is more directly than a word
                                    above it would. Announced for a screen reader, where the
                                    control's value is not self-describing in the same way. */}
                                <FormLabel className="sr-only">Group</FormLabel>
                                <Select
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    /* A choice of one is not a choice. The value is still
                                      * set and still submitted — the control simply stops
                                      * pretending there is a decision to make. */
                                    disabled={orgs.length <= 1}
                                >
                                    <FormControl>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Choose a group" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {orgs.map((org) => (
                                            <SelectItem key={org.id} value={org.id}>
                                                <OrgAvatar org={org} className="size-5" />
                                                {org.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )}
                    />

                    {/* Photos come before the writing, and after the group: what a post is
                      * about is usually the picture, and the caption is written to it. It
                      * also puts the one control that needs a round trip first, so the
                      * uploads are already running while the announcement is being typed. */}
                    <PhotoStrip
                        media={media}
                        onAdd={addPhotos}
                        onRemove={removePhoto}
                        pending={uploadingPhotos}
                        disabled={!orgId}
                    />

                    {/* Below the photos, because it is the rarer of the two and a post with a
                        sign-up sheet usually has a picture as well. */}
                    <AttachmentSlot
                        attachment={attachment}
                        onAdd={addFile}
                        onRemove={() => setAttachment(null)}
                        uploading={attaching}
                        disabled={!orgId}
                    />

                    {/* The body is borderless too, and grows with what is typed
                      * (`field-sizing-content` comes from the primitive) — boxing it would
                      * make composing an announcement feel like filing a record. The avatar
                      * belongs to it rather than to the headline above, because this is the
                      * part written in the person's own voice. */}
                    <FormField
                        control={form.control}
                        name="body"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="sr-only">Post</FormLabel>
                                <FormControl>
                                    <div className="flex items-start gap-3">
                                        <Avatar person={viewer} className="size-9" />
                                        {/* Padded so the *first line* sits on the avatar's
                                          * centre line rather than its top edge — half the
                                          * difference between the two heights. Centring the
                                          * whole field instead would drift the opening line
                                          * downward as the post grows. */}
                                        <Textarea
                                            placeholder={`Share something with ${target}…`}
                                            rows={4}
                                            className="min-h-24 resize-none border-0 bg-transparent px-0 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
                                            {...field}
                                        />
                                    </div>
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </div>

                <div className="shrink-0 border-t px-4 py-3 sm:flex sm:justify-end">
                    <Button
                        type="submit"
                        size="lg"
                        disabled={disabled}
                        className="w-full sm:w-fit sm:px-10"
                    >
                        {loading ? (
                            <Ripple
                                aria-label="Publishing post"
                                className="size-8 [&_circle]:stroke-current"
                            />
                        ) : (
                            "Post"
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    )
}

/* -------------------------------------------------------------------------- */
/* The two surfaces                                                           */
/* -------------------------------------------------------------------------- */

const ComposeDialog = ({ open, onOpenChange, guard, onDirtyChange }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
            className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-lg"
            /* A half-written post must not be lost to a stray click on the backdrop or a
              * reflexive Escape. The close button stays, so there is still one way out —
              * it is simply the deliberate one. */
            onPointerDownOutside={guard}
            onEscapeKeyDown={guard}
        >
            {/* Announced, not shown. The visible heading is the title field the form pins at
                its top; Radix still needs a real title and description to describe the
                dialog, and warns in the console when one is missing. */}
            <DialogHeader className="sr-only">
                <DialogTitle>New post</DialogTitle>
                <DialogDescription>
                    Write a post and publish it to a group you administer.
                </DialogDescription>
            </DialogHeader>
            <ComposeForm
                heading
                onDone={() => onOpenChange(false)}
                onDirtyChange={onDirtyChange}
            />
        </DialogContent>
    </Dialog>
)

const ComposeDrawer = ({ open, onOpenChange, onDirtyChange }) => (
    /* repositionInputs is off for the same reason the comments drawer turns it off: Vaul's
     * implementation keeps a mobile-Safari scroll lock installed that hand-focuses inputs,
     * and that focus does not take inside the Capacitor WebView — the field looks dead. See
     * the note in components/Comments.jsx. Keeping the submit above the keyboard is
     * KeyboardAwareColumn's job instead. */
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        {/* dvh, not vh: on a mobile browser vh is the tall viewport, so the sheet's foot
            would sit under the browser's own toolbar. */}
        <DrawerContent className="h-[90dvh] max-h-[90dvh]">
            <KeyboardAwareColumn>
                {/* The sheet keeps its name. A bottom sheet arrives from off-screen with none
                    of the dialog's framing, so a phone needs the label the desktop can spend
                    on the headline instead — which is why the title field is in the body here
                    (see `heading` on <ComposeForm/>). */}
                <DrawerHeader className="shrink-0 border-b pt-2 pb-4">
                    <DrawerTitle className="text-center font-semibold">
                        New post
                    </DrawerTitle>
                </DrawerHeader>
                {open && (
                    <ComposeForm
                        onDone={() => onOpenChange(false)}
                        onDirtyChange={onDirtyChange}
                    />
                )}
            </KeyboardAwareColumn>
        </DrawerContent>
    </Drawer>
)

/* -------------------------------------------------------------------------- */
/* The entrance                                                               */
/* -------------------------------------------------------------------------- */

/* The plus in the nav, and the surface behind it.
 *
 * Rendered by the shell in both rails — the desktop column under Inbox and the mobile bar
 * beside it — with the same classes `NavItem` uses, so it sits in the same fixed icon box and
 * grows the same label when the rail expands. Only one of the two rails is ever visible, so
 * only one of these can be opened.
 *
 * Crossing the breakpoint swaps dialog for sheet. Anything typed is lost in that moment,
 * which is a rotation mid-draft on a tablet and nothing else; holding the draft in a store to
 * survive it would be state with one purpose and a lifetime nobody could name. */
const ComposeButton = () => {
    const [open, setOpen] = useState(false)
    const [dirty, setDirty] = useState(false)
    const isDesktop = useIsDesktop()

    /* React state, not a URL, so Android's back gesture has nothing to unwind and would
     * close the app from on top of the sheet. */
    useBackHandler(open, () => setOpen(false))

    /* Declines a dismissal that would discard writing. Passed to the dialog's outside-press
     * and Escape handlers; the drawer needs no equivalent, because a swipe down is itself a
     * deliberate gesture rather than a stray click. */
    const guard = useCallback(
        (event) => {
            if (dirty) event.preventDefault()
        },
        [dirty],
    )

    const trigger = (
        <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="New post"
            className="flex cursor-pointer select-none items-center justify-center md:h-12 md:justify-start md:rounded-md md:transition-colors md:hover:bg-accent"
        >
            <span className="flex items-center justify-center md:w-[calc(var(--nav-width)-1rem)] md:shrink-0">
                <Plus className="size-6" />
            </span>
            <span className={cn(
                "hidden whitespace-nowrap pr-4 text-base leading-none opacity-0 transition-opacity duration-200 ease-out md:block",
                "group-data-[open=true]:opacity-100",
            )}>
                Create
            </span>
        </button>
    )

    return (
        <>
            {trigger}
            {isDesktop ? (
                <ComposeDialog
                    open={open}
                    onOpenChange={setOpen}
                    guard={guard}
                    onDirtyChange={setDirty}
                />
            ) : (
                <ComposeDrawer open={open} onOpenChange={setOpen} onDirtyChange={setDirty} />
            )}
        </>
    )
}

/* Admin-of-anywhere wrapper. A viewer who administers nothing renders nothing at all — they
 * must not see an affordance for a tier they cannot reach in any group. */
const Compose = () => (
    <Privileged role={ROLES.ADMIN} anyOrg>
        <ComposeButton />
    </Privileged>
)

export default Compose
