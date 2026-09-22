"use client"

import { useShallow } from "zustand/react/shallow"

import usePrefsStore from "./store"

/* The reading translation, and the tap that changes it. Read by the setting that offers it and
 * by `usePrologue`, which hands the value down to the store that fetches with it. */
export const useReadingTranslation = () =>
    usePrefsStore(
        useShallow((state) => ({
            translation: state.translation,
            setTranslation: state.setTranslation,
        })),
    )
