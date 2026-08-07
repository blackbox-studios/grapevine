import { useEffect, useState } from "react"

/* Returns a timestamp that refreshes on an interval so relative-time labels
 * ("5 minutes ago") stay current, without reading the impure Date.now() during
 * render (react-hooks/purity). Defaults to a 60s tick — enough for the
 * minute-granularity "time ago" copy this app renders. */
export function useNow(intervalMs = 60_000) {
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs)
        return () => clearInterval(id)
    }, [intervalMs])

    return now
}
