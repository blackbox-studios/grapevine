"use client"

import SpinnerSvg from "@/assets/svg/spinner.svg"
import { cn } from "@/lib/utils"

/* The app's one spinner. Reach for it rather than rolling a `border-t animate-spin` ring.
 *
 * There is no full-screen loading surface here any more. The boot overlay this file used to
 * export covered the window before the session resolved, and it held itself on screen for a
 * minimum of a second so it could not flicker — so every cold start cost a second whether or
 * not anything was actually being waited on. The gates render nothing through that window
 * instead; see the header of `components/AuthGate.jsx`.
 *
 * For a button that has kicked off async work, this is not the right thing either — swap the
 * button's children for `<Ripple/>` (see the frontend architecture guide). */
export const Spinner = ({ className, ...props }) => (
    <SpinnerSvg
        className={cn(
            "w-16 mb-12 origin-center animate-[spin_0.4s_linear_infinite] direction-[reverse]",
            className,
        )}
        {...props}
    />
)

export default Spinner
