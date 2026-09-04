"use client"

import { useCallback, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"

import useSheetStore from "./store"

/* The open sign-up sheet, and every write to a date on it.
 *
 * One hook rather than several, because the surfaces that use it want overlapping slices of
 * the same thing: the accordion on `/events` takes `claim` and `release`, the manage table
 * takes `saveSlot`, `removeSlot` and `extend`, and both take `current`. Splitting them would
 * mean two subscriptions to one store on a page that renders both.
 *
 * `open`/`toggle` take the sheet id, so a row does not have to know whether it is the one
 * already expanded — the store answers that. */
export const useSheet = () => {
    const [
        openId, current, ready, loadingSlot, saving,
        toggle, open, close, claim, release, saveSlot, removeSlot, save, extend,
    ] = useSheetStore(useShallow(state => ([
        state.openId,
        state.current,
        state.ready,
        state.loading.slot,
        state.loading.write,
        state.toggle,
        state.open,
        state.close,
        state.claim,
        state.release,
        state.saveSlot,
        state.removeSlot,
        state.save,
        state.extend,
    ])))

    /* Cancelling and restoring are the same write with the flag flipped, named for what the
     * admin is doing rather than for the column it sets. */
    const cancelSlot = useCallback(
        (slotId) => saveSlot(slotId, { canceled: true }),
        [saveSlot],
    )
    const restoreSlot = useCallback(
        (slotId) => saveSlot(slotId, { canceled: false }),
        [saveSlot],
    )

    return useMemo(() => ({
        openId,
        /* The sheet only once it is the one that was asked for — otherwise a row that has just
         * been expanded would render the previous rota's dates for a frame. */
        sheet: current?.id === openId ? current : null,
        skeleton: !ready,
        /* Keyed by slot id: one row's spinner, not the rota's. */
        working: loadingSlot,
        saving,
        toggle,
        open,
        close,
        claim,
        release,
        cancelSlot,
        restoreSlot,
        saveSlot,
        removeSlot,
        save,
        extend,
    }), [
        openId, current, ready, loadingSlot, saving,
        toggle, open, close, claim, release, cancelSlot, restoreSlot,
        saveSlot, removeSlot, save, extend,
    ])
}
