import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"

import { DEFAULT_TRANSLATION, READING_TRANSLATIONS } from "@/lib/constants"

/* What this device has been told to prefer.
 *
 * ── Why the device and not the person ────────────────────────────────────────
 *
 * `/settings/general` asks about the device — the theme, whether this handset may buzz — while
 * `/settings/info` asks about the person and writes to their `Profile`. A reading translation
 * belongs to the first list: it is what this screen prints, it needs no server to be honoured,
 * and putting it on the profile would mean a column, a migration and a round trip to change a
 * dropdown. The cost is that a reader with a phone and a laptop sets it twice, which is the
 * bargain the theme already makes.
 *
 * ── It holds a choice, and reaches into nothing ──────────────────────────────
 *
 * The same shape as `org`, and for the same reason: this store fetches nothing, resets nothing,
 * and never calls into another store. A translation reaches the Daily Read by being *read* —
 * `usePrologue` depends on it and hands it to `init`, which drops the days it is holding when
 * the value it was given changes. That keeps the imports one-directional, where a store that
 * both fed the prologue and was invalidated by it would be a cycle. */

const INIT = {
    /* Which English the day's appointed scripture is printed in. Always one of
     * `READING_TRANSLATIONS` — see `merge`. */
    translation: DEFAULT_TRANSLATION,
}

const known = (value) => READING_TRANSLATIONS.some((option) => option.value === value)

const useStore = create(
    immer(
        persist(
            (set) => ({
                ...INIT,

                setTranslation: (translation) => {
                    if (!known(translation)) return
                    set((state) => {
                        state.translation = translation
                    })
                },
            }),
            {
                name: "grapevine-prefs",
                /* A value restored from disk that is no longer offered is not a preference, it
                 * is a request the server would refuse — so retiring a translation puts the
                 * readers who chose it back on the default rather than onto an empty screen. */
                merge: (persisted, current) => ({
                    ...current,
                    ...persisted,
                    translation: known(persisted?.translation)
                        ? persisted.translation
                        : DEFAULT_TRANSLATION,
                }),
            },
        ),
    ),
)

export default useStore
