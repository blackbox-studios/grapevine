"use client"

import { useRef } from "react"

import Ripple from "@/assets/svg/ripple.svg"
import Icon from "@/components/Icon"
import { Avatar } from "@/components/Widgets"
import { IMAGE_MIME_TYPES } from "@/lib/constants"
import { useAvatarUpload } from "@/lib/store/auth/hook"
import { cn } from "@/lib/utils"

/* The viewer's own picture, with a badge that replaces it.
 *
 * **One tap, then the device's own picker — no editor screen in between.** That is what the
 * apps that do this well converge on (Otter, Mammoth, Character AI all put a small pencil on
 * the avatar and go straight to the photo library), and it is the right shape here for a
 * reason beyond fashion: there is exactly one thing to change. A screen whose only control is
 * the one you already tapped is a screen that exists to be dismissed.
 *
 * **There is no crop step, and that is a real omission rather than an oversight.** Several of
 * those apps offer one. `prepareFile` already scales the photo to `IMAGE_MAX_DIMENSION`,
 * re-encodes it to WebP and strips EXIF, and every surface renders an avatar in a circle with
 * `object-cover` — so a rectangular photo is centre-cropped for display and nothing breaks.
 * What is lost is the ability to choose *which* part of a wide photo becomes the circle. On
 * iOS the system picker's own edit affordance covers most of it; on Android and in a browser
 * it does not. If it matters, the place for it is a cropper between `pick` and `upload`, not
 * a change here.
 *
 * The file input is hidden and driven by the badge, which is the only way to get a styled
 * control in front of the platform picker. `accept` is the same list the server admits, so a
 * file that could not possibly be accepted is filtered out by the picker rather than refused
 * after a round trip — and on a phone that list is also what makes the camera an option.
 *
 * `value` is cleared after every pick so choosing the *same* file twice still fires `change`;
 * without it a failed upload could not be retried with the same photo. **The list is copied
 * out first**, and that is not tidiness: `event.target.files` is a live view of the input, so
 * clearing the value empties the very FileList that was about to be uploaded. */
export const AvatarPicker = ({ person, className, badgeClassName }) => {
    const inputRef = useRef(null)
    const { pick, busy } = useAvatarUpload()

    const onChange = async (event) => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ""
        await pick(files)
    }

    return (
        <div className={cn("relative shrink-0", className)}>
            <Avatar person={person} className="size-full text-2xl" />

            {/* Dims the picture while the photo is in flight, so the thing being replaced is
                visibly the thing being waited on. */}
            {busy && (
                <span className="absolute inset-0 grid place-items-center rounded-full bg-background/60">
                    <Ripple
                        aria-label="Updating your profile picture"
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

            {/* Top right, overlapping the circle's edge so it reads as attached to the picture
                rather than floating beside it. `ring-background` is what keeps it legible
                against a photo of any colour underneath. */}
            <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                aria-label="Change your profile picture"
                className={cn(
                    "absolute -right-2 -top-0.5 grid size-8 cursor-pointer place-items-center rounded-full bg-background text-foreground ring-3 ring-background transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
                    badgeClassName,
                )}
            >
                <Icon size="sm">edit</Icon>
            </button>
        </div>
    )
}

export default AvatarPicker
