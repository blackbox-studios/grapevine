import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/* Custom classes */
const twMerge = extendTailwindMerge({
    extend: {
        theme: {
            color: ["success", "warning", "link"],
        },
        classGroups: {
            "font-size": [{ text: ["xxs", "button"] }],
        },
    },
})

export function cn(...inputs) {
    return twMerge(clsx(inputs))
}

export function statusDotClasses(tone) {
    const STATUS_DOT_TONES = {
        success: "bg-success border border-success",
        warning: "bg-warning border border-warning",
        destructive: "bg-destructive border border-destructive",
        muted: "border border-muted-foreground/40",
        "success-outline": "border border-success bg-background",
    }
    return STATUS_DOT_TONES[tone] ?? STATUS_DOT_TONES.muted
}

export const transition = (reduceMotion = false, duration = 0.3, delay = 0) => {
    if (reduceMotion) return {}
    return {
        initial: { opacity: 0.01 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { ease: "easeInOut", duration, delay },
    }
}

export function formatTimestamp(iso) {
    const d = new Date(iso)
    const p = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    })
}

/* Day-granular relative time — "Today", "a week ago", etc. */
export function timeAgoMacro(current, previous) {
    const msPerDay = 24 * 60 * 60 * 1000
    const elapsed = current - previous

    if (elapsed < msPerDay) return "Today"

    const days = Math.floor(elapsed / msPerDay)

    if (days === 1) return "Yesterday"
    if (days < 7) return `${days} days ago`
    if (days < 14) return "a week ago"
    if (days < 30) {
        const weeks = Math.floor(days / 7)
        return weeks === 1 ? "a week ago" : `${weeks} weeks ago`
    }
    if (days < 60) return "a month ago"
    if (days < 365) {
        const months = Math.floor(days / 30)
        return months === 1 ? "a month ago" : `${months} months ago`
    }
    if (days < 730) return "a year ago"
    const years = Math.floor(days / 365)
    return years === 1 ? "a year ago" : `${years} years ago`
}

export function timeAgo(current, previous) {
    const msPerMinute = 60 * 1000
    const msPerHour = msPerMinute * 60
    const msPerDay = msPerHour * 24
    const msPerMonth = msPerDay * 30
    const msPerYear = msPerDay * 365

    const elapsed = current - previous

    if (elapsed < msPerMinute) return `${Math.round(elapsed / 1000)} s ago`
    if (elapsed < msPerHour) return `${Math.round(elapsed / msPerMinute)} min ago`
    if (elapsed < msPerDay) return `${Math.round(elapsed / msPerHour)} hr ago`
    if (elapsed < msPerMonth) return `${Math.round(elapsed / msPerDay)} d ago`
    if (elapsed < msPerYear) return `${Math.round(elapsed / msPerMonth)} mo ago`
    return `${Math.round(elapsed / msPerYear)} yr ago`
}

/* The app's base path with any trailing slash stripped: "" in host dev, otherwise
 * the configured NEXT_PUBLIC_BASE_PATH (kept in sync with basePath in next.config). */
export const basePath = () => (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')

/* Prefix a router route with the base path so redirects that bypass the router
 * still resolve when the SPA is served under a subpath. */
export const appPath = (route) => `${basePath()}${route}`

/* Display label for a role string. */
export function roleLabel(role) {
    if (!role) return "User"
    return role.charAt(0).toUpperCase() + role.slice(1)
}

/* Deterministic per-value avatar gradient. Same input always maps to the same
 * gradient so each user gets a stable, distinct color. */
export function gradientFor(value) {
    const str = String(value ?? "")
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
    }
    const hue = Math.abs(hash) % 360
    const light = `hsl(${hue} 90% 82%)`
    const mid = `hsl(${hue} 75% 58%)`
    const dark = `hsl(${(hue + 18) % 360} 70% 40%)`

    return {
        backgroundImage: `radial-gradient(circle at 30% 25%, ${light} 0%, ${mid} 45%, ${dark} 100%)`,
    }
}

export function hashColorScheme(value) {
    const BADGE_COLOR_PALETTE = [
        "text-red-600 bg-red-600/10 border-red-600/30 dark:text-red-400 dark:bg-red-400/10 dark:border-red-400/40",
        "text-teal-600 bg-teal-600/10 border-teal-600/30 dark:text-teal-400 dark:bg-teal-400/10 dark:border-teal-400/40",
        "text-fuchsia-600 bg-fuchsia-600/10 border-fuchsia-600/30 dark:text-fuchsia-400 dark:bg-fuchsia-400/10 dark:border-fuchsia-400/40",
        "text-lime-700 bg-lime-700/10 border-lime-700/30 dark:text-lime-400 dark:bg-lime-400/10 dark:border-lime-400/40",
        "text-indigo-600 bg-indigo-600/10 border-indigo-600/30 dark:text-indigo-400 dark:bg-indigo-400/10 dark:border-indigo-400/40",
        "text-orange-600 bg-orange-600/10 border-orange-600/30 dark:text-orange-400 dark:bg-orange-400/10 dark:border-orange-400/40",
        "text-cyan-600 bg-cyan-600/10 border-cyan-600/30 dark:text-cyan-400 dark:bg-cyan-400/10 dark:border-cyan-400/40",
        "text-pink-600 bg-pink-600/10 border-pink-600/30 dark:text-pink-400 dark:bg-pink-400/10 dark:border-pink-400/40",
        "text-green-600 bg-green-600/10 border-green-600/30 dark:text-green-400 dark:bg-green-400/10 dark:border-green-400/40",
        "text-violet-600 bg-violet-600/10 border-violet-600/30 dark:text-violet-400 dark:bg-violet-400/10 dark:border-violet-400/40",
        "text-amber-700 bg-amber-700/10 border-amber-700/30 dark:text-amber-400 dark:bg-amber-400/10 dark:border-amber-400/40",
        "text-sky-600 bg-sky-600/10 border-sky-600/30 dark:text-sky-400 dark:bg-sky-400/10 dark:border-sky-400/40",
        "text-rose-600 bg-rose-600/10 border-rose-600/30 dark:text-rose-400 dark:bg-rose-400/10 dark:border-rose-400/40",
        "text-emerald-600 bg-emerald-600/10 border-emerald-600/30 dark:text-emerald-400 dark:bg-emerald-400/10 dark:border-emerald-400/40",
        "text-purple-600 bg-purple-600/10 border-purple-600/30 dark:text-purple-400 dark:bg-purple-400/10 dark:border-purple-400/40",
        "text-yellow-700 bg-yellow-700/10 border-yellow-700/30 dark:text-yellow-400 dark:bg-yellow-400/10 dark:border-yellow-400/40",
        "text-blue-600 bg-blue-600/10 border-blue-600/30 dark:text-blue-400 dark:bg-blue-400/10 dark:border-blue-400/40",
    ]

    function hashString(input) {
        const str = String(input ?? "")
        let hash = 5381
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
        }
        hash ^= hash >>> 16
        hash = Math.imul(hash, 0x85ebca6b)
        hash ^= hash >>> 13
        hash = Math.imul(hash, 0xc2b2ae35)
        hash ^= hash >>> 16
        return hash >>> 0
    }
    const index = hashString(value) % BADGE_COLOR_PALETTE.length
    return BADGE_COLOR_PALETTE[index]
}
