"use client"

import { useTheme } from "@/lib/providers/Theme"
import { useMounted } from "@/lib/hooks/useMounted.hook"
import { appPath, cn } from "@/lib/utils"

const THEME_OPTIONS = [
    { value: "light", label: "Light", image: appPath("/theme/light.png") },
    { value: "system", label: "Auto", image: appPath("/theme/light-dark.png") },
    { value: "dark", label: "Dark", image: appPath("/theme/dark.png") },
]

const SettingsGeneralPage = () => {
    const { theme, setTheme } = useTheme()

    /* next-themes doesn't know the active theme until mounted; gate the selected
     * state on it so the server/first-client render agree (nothing selected) before
     * the switcher lights up the current choice. */
    const mounted = useMounted()

    return (
        <section className="flex flex-col gap-6">
            <h2 className="text-xl font-semibold text-foreground">Appearance</h2>

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
    )
}

export default SettingsGeneralPage
