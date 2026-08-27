"use client"

import { BackHeader } from "@/components/BackHeader"
import { ROUTES } from "@/lib/constants"
import { useTheme } from "@/lib/providers/Theme"
import { useMounted } from "@/lib/hooks/useMounted.hook"
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

    /* The same centered column `/profile` uses, and for the same reason: this page holds one
     * small control, and left-aligning it against the full width of a desktop shell put the
     * heading and three thumbnails in the top-left corner of an otherwise empty screen. The
     * roster next door genuinely needs the width — it is a table that scrolls sideways inside
     * itself — so the constraint belongs on this page rather than on the settings layout.
     *
     * `max-w-[470px]` and the `md:pt-0` are lifted verbatim from `/profile`, so arriving here
     * from that list does not change the shape of the page under the reader. */
    return (
        <>
            {/* Titled "General" after the row on `/profile` that leads here, which is also where
                the arrow goes back to. The theme switcher below is the first of what will be
                several sections under it, which is why it keeps a heading of its own. */}
            <BackHeader title="General" back={ROUTES.PROFILE} bleed />

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
            </section>
        </>
    )
}

export default SettingsGeneralPage
