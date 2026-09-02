"use client"

import { BackHeader } from "@/components/BackHeader"
import { Button } from "@/components/ui/button"
import Ripple from "@/assets/svg/ripple.svg"
import { ROUTES } from "@/lib/constants"
import { useTheme } from "@/lib/providers/Theme"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { usePushPermission } from "@/lib/store/push/hook"
import { appPath, cn } from "@/lib/utils"

const THEME_OPTIONS = [
    { value: "light", label: "Light", image: appPath("/img/theme/light.png") },
    { value: "system", label: "Auto", image: appPath("/img/theme/light-dark.png") },
    { value: "dark", label: "Dark", image: appPath("/img/theme/dark.png") },
]

const SettingsGeneralPage = () => {
    const { theme, setTheme } = useTheme()

    /* next-themes doesn't know the active theme until mounted; gate the selected
     * state on it so the server/first-client render agree (nothing selected) before
     * the switcher lights up the current choice. */
    const mounted = useMounted()

    /* The same centered column `/settings` uses, and the same width: this page holds a few small
     * controls, and left-aligned against the full width of a desktop shell they sit in the
     * top-left corner of an otherwise empty screen. Matching the index is what keeps arriving
     * here from that list from changing the shape of the page under the reader. */
    return (
        <>
            {/* Titled "General" after the row on `/settings` that leads here, which is also
                where the arrow goes back to. Device settings only — anything about the person
                is edited on their own profile, which is the surface that shows it. */}
            <BackHeader title="General" back={ROUTES.SETTINGS} bleed />

            <section className="mx-auto flex w-full max-w-[470px] flex-col gap-6 pb-10 md:pt-0">
                <h3 className="text-lg font-medium text-foreground">Appearance</h3>

                <div className="flex flex-wrap gap-6">
                    {THEME_OPTIONS.map(({ value, label, image }) => {
                        const selected = mounted && theme === value

                        return (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setTheme(value)}
                                aria-pressed={selected}
                                className="flex flex-col items-center gap-2 outline-hidden cursor-pointer"
                            >
                                <span
                                    className={cn(
                                        "block overflow-hidden rounded-2xl border-2 transition-colors",
                                        selected
                                            ? "border-ring"
                                            : "border-transparent hover:border-border"
                                    )}
                                >
                                    <img
                                        src={image}
                                        alt={`${label} theme preview`}
                                        className="h-24 w-32 object-cover"
                                    />
                                </span>
                                <span
                                    className={cn(
                                        "text-sm",
                                        selected ? "text-foreground" : "text-muted-foreground"
                                    )}
                                >
                                    {label}
                                </span>
                            </button>
                        )
                    })}
                </div>

                <PushSection />
            </section>
        </>
    )
}

/* The standing offer to turn push on.
 *
 * **A button, not a switch.** A switch promises it can be moved back, and turning push off is
 * a trip to the OS's own settings whatever this screen does; turning it on is the one
 * direction the app can act in.
 *
 * **Offered in every state short of granted, a spent refusal included** — there the tap opens
 * the OS's notification settings rather than prompting, which is `turnOn`'s decision to make.
 * So the Ripple appears only on the prompt path, `enabling` being that store action's flag.
 *
 * Absent entirely on the web, where `pushSupported()` is false: an empty "Notifications"
 * heading over a control that does nothing is worse than no section. */
const PushSection = () => {
    const { supported, permission, enabling, turnOn } = usePushPermission()

    if (!supported) return null

    return (
        /* One block rather than three items in the page's rhythm: the heading belongs closer to
           the text it introduces than the section does to the one above it, so the gap here is
           tighter than the `gap-6` the section spaces its children by. */
        <div className="flex flex-col items-start gap-3">
            <h3 className="text-lg font-medium text-foreground">Notifications</h3>

            {permission === "granted" ? (
                <p className="text-sm text-muted-foreground">
                    Notifications are on for this device. Turn them off in your device
                    settings.
                </p>
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        Get a notification when your parish posts, or when someone likes
                        something you wrote.
                    </p>
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={turnOn}
                        disabled={enabling}
                        className="px-8"
                    >
                        {enabling ? (
                            <Ripple
                                aria-label="Turning on notifications"
                                className="size-8 [&_circle]:stroke-current"
                            />
                        ) : (
                            "Turn on notifications"
                        )}
                    </Button>
                </>
            )}
        </div>
    )
}

export default SettingsGeneralPage
