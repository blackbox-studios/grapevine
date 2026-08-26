"use client"

import { useRef } from "react"

import Ripple from "@/assets/svg/ripple.svg"
import Icon from "@/components/Icon"
import { OrgAvatar } from "@/components/Widgets"
import { IMAGE_MIME_TYPES, UPLOAD_PURPOSES } from "@/lib/constants"
import { useUpload } from "@/lib/store/uploads/hook"
import { cn } from "@/lib/utils"

/* A group's picture, with a badge that replaces it.
 *
 * The organization counterpart of `<AvatarPicker/>`, and deliberately a second component
 * rather than a `person | org` prop on that one. The two differ in three places at once —
 * the fallback mark (`<OrgAvatar/>` derives from the slug and the group's initials, not from
 * name parts), the upload purpose (`ORG_AVATAR`, which needs an `orgId` the viewer's own
 * avatar has no equivalent of), and the save (a PATCH of a group rather than of the viewer).
 * A single component switching on which of two shapes it was handed would be branching in
 * all three, which is a component doing two jobs badly.
 *
 * What it does share is the interaction, and that is on purpose: one tap on the badge, then
 * the device's own picker, no editor screen and no crop step. An admin changing a parish's
 * picture should meet exactly what they met changing their own — see the header of
 * `<AvatarPicker/>` for why that shape, and what the missing cropper costs.
 *
 * **Saving is the caller's, uploading is not.** This hands back the uploaded URL and lets
 * the screen decide what to do with it, because the group form has other fields in flight:
 * the editor persists the picture immediately (a picture has no "unsaved" state a person
 * would recognise) while the name waits for Save, and that difference belongs in the screen
 * that knows about both.
 *
 * `value` is cleared after every pick so choosing the same file twice still fires `change`,
 * and the list is copied out *first* — `event.target.files` is a live view of the input, so
 * clearing the value empties the very FileList that was about to be uploaded. */
export const OrgAvatarPicker = ({ org, onUploaded, saving = false, className }) => {
    const inputRef = useRef(null)
    const { upload, uploading } = useUpload(UPLOAD_PURPOSES.ORG_AVATAR, org?.id ?? null)

    const busy = uploading || saving

    const onChange = async (event) => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ""

        const [uploaded] = await upload(files)
        /* The upload already parked and toasted its own failure; stopping here keeps a
         * failed transfer from clearing a picture that is still perfectly good. */
        if (!uploaded) return
        await onUploaded?.(uploaded.url)
    }

    return (
        <div className={cn("relative shrink-0", className)}>
            <OrgAvatar org={org} className="size-full text-2xl" />

            {busy && (
                <span className="absolute inset-0 grid place-items-center rounded-full bg-background/60">
                    <Ripple
                        aria-label="Updating the group picture"
                        className="size-8 [&_circle]:stroke-current"
                    />
                </span>
            )}

            <input
                ref={inputRef}
                type="file"
                accept={IMAGE_MIME_TYPES.join(",")}
                onChange={onChange}
                className="hidden"
            />

            <button
                type="button"
                disabled={busy || !org}
                onClick={() => inputRef.current?.click()}
                aria-label="Change the group picture"
                className="absolute -right-2 -top-0.5 grid size-8 cursor-pointer place-items-center rounded-full bg-background text-foreground ring-3 ring-background transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
                <Icon size="sm">edit</Icon>
            </button>
        </div>
    )
}

export default OrgAvatarPicker
