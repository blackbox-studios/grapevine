import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

import { NESTED_TRANSITION_ROUTES, ROUTES, SLIDE_ROUTES } from "@/lib/constants"

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

/* Normalizes anything a store action can catch into the string list `useErrorListener`
 * expects (see frontend-architecture.md → Error Handling).
 *
 * Only an `ApiError` contributes its own `message`, because the API contract guarantees that
 * message is a single sentence written to be shown to a user. Anything else reaching here is
 * a bug in our own code — a TypeError, a non-Error throw — and its message is an internal
 * string, so the caller's copy is used instead.
 *
 * Stores should still branch on `error.code` when the *behaviour* differs — a 404 the UI
 * already renders as an empty state shouldn't also toast. This only formats the message. */
export const toErrorList = (error, fallback) => {
    const trusted = error?.name === "ApiError" && typeof error.message === "string"
    return [trusted && error.message.length > 0 ? error.message : fallback]
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

/* Compact, Instagram-style relative time from a timestamp: "now", "5m", "9h",
 * "2d", "3w", "5mo", "2y". `current`/`previous` are epoch ms (pass now from
 * useNow() so it stays pure across renders and refreshes on the minute). */
export function timeAgoCompact(current, previous) {
    const seconds = Math.max(0, Math.floor((current - previous) / 1000))
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    const weeks = Math.floor(days / 7)
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)

    if (seconds < 60) return "now"
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    if (weeks < 5) return `${weeks}w`
    if (months < 12) return `${months}mo`
    return `${years}y`
}

/* The app's base path with any trailing slash stripped: "" in host dev, otherwise
 * the configured NEXT_PUBLIC_BASE_PATH (kept in sync with basePath in next.config). */
export const basePath = () => (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')

/* Prefix a router route with the base path so redirects that bypass the router
 * still resolve when the SPA is served under a subpath.
 *
 * An absolute URL passes through untouched. Uploaded media lives in Supabase Storage and is
 * addressed by its full https:// URL, while the seeded corpus is root-relative — both go
 * through the same `<img src={appPath(...)}>`, and prefixing the first would produce
 * "/app/https://…". Protocol-relative ("//host/…") counts as absolute for the same reason. */
export const appPath = (route) =>
    /^([a-z][a-z0-9+.-]*:)?\/\//i.test(route) ? route : `${basePath()}${route}`

/* The deep-link route for a single post's detail page (`/p/:id`). Built off
 * ROUTES.POST so the path prefix lives in one place. */
export const postPath = (id) => `${ROUTES.POST}/${id}`

/* ---------------------------------------------------------------------------
 * Route resolution
 *
 * Every "this pathname is special" question the shell asks is answered here, off
 * the SLIDE_ROUTES / NESTED_TRANSITION_ROUTES registries in constants.js. Never
 * re-derive these with an inline `pathname.startsWith(...)` at a call site — add
 * the route to the registry instead, and every consumer picks it up at once.
 * ------------------------------------------------------------------------- */

/* Segment-safe prefix test: "/p" matches "/p" and "/p/abc" but never "/pizza". */
const isUnder = (pathname, prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)

/* The registered slide route this pathname belongs to, with the dynamic segment it
 * was opened with — `{ prefix, base, param }` — or null for an ordinary route. */
export const slideRouteFor = (pathname) => {
    const route = SLIDE_ROUTES.find((r) => isUnder(pathname, r.prefix))
    if (!route) return null
    const param = pathname.slice(route.prefix.length + 1).split("/")[0] || null
    return { ...route, param }
}

/* The route the shell should behave as if it's on. A slide route resolves to the
 * base surface it overlays (the feed is still the "current place" while a post is
 * open); every other route is itself. */
export const baseRouteFor = (pathname) => slideRouteFor(pathname)?.base ?? pathname

/* Key for the top-level <PageTransition/>. Collapsing a group of paths to one key
 * suppresses the cross-fade at that level: nested trees own their sub-route fades,
 * and a slide route keys to its base so the base never fades or scrolls out from
 * under the overlay. */
export const pageTransitionKey = (pathname) =>
    NESTED_TRANSITION_ROUTES.find((prefix) => isUnder(pathname, prefix)) ??
    baseRouteFor(pathname)

/* Whether a nav destination should read as current. Resolves through the base route
 * first, so an open slide route keeps its base tab lit. */
export const isRouteActive = (pathname, href) => {
    const base = baseRouteFor(pathname)
    return href === ROUTES.DEFAULT ? base === ROUTES.DEFAULT : isUnder(base, href)
}

/* Shared timing for the slide-route push. The incoming surface and the base it
 * pushes both animate on this exact curve — and, being the same width, over the
 * exact same distance — so their touching edges stay locked together for the whole
 * gesture instead of one outrunning the other. iOS-like ease. */
export const SLIDE_TRANSITION = { duration: 0.34, ease: [0.32, 0.72, 0, 1] }

/* How a slide-route surface enters and leaves, per presentation.
 *
 * `modal` is the in-app open: a full viewport of horizontal travel on SLIDE_TRANSITION,
 * which is the exact distance and curve <SlideBase/> pushes the surface behind it. The two
 * are one movement, and they only read as one while both halves of that pairing come from
 * here — which is the reason this is a shared value rather than an object per surface.
 *
 * `page` is the cold load: a shared link or a refresh, where nothing is mounted behind to be
 * pushed. There is no coupled motion to match, so it fades. Sliding a surface in over a blank
 * screen animates a relationship that does not exist. */
export const slideSurfaceAnim = (variant) =>
    variant === "modal"
        ? {
              initial: { x: "100%" },
              animate: { x: 0 },
              exit: { x: "100%" },
              transition: SLIDE_TRANSITION,
          }
        : {
              initial: { opacity: 0 },
              animate: { opacity: 1 },
              exit: { opacity: 0 },
              transition: { duration: 0.2, ease: "easeOut" },
          }

/* Shared timing for a row making room in a list — the comment thread closing over a deleted
 * comment, or sliding down around a new one.
 *
 * A spring, not a duration: a row travels however tall its neighbour turns out to be, and a
 * fixed duration reads as hurried at one line and sluggish at six. Shared so that everything
 * moving in the same list moves together — the rows and the "load more" button below them are
 * one column, and two curves make them visibly separate. Both are just past critically damped,
 * so they settle without overshooting; a list correcting itself should not bounce. */
export const ROW_SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 }

/* The same idea at the scale of a feed card.
 *
 * **A spring settles in roughly the same time whatever the distance**, so one tuned to a
 * 60px comment row covers a 600px post card in the same fraction of a second — which is the
 * definition of a snap. This is the softer end of the same family, for lists whose items are
 * a screenful rather than a line. Reach for `ROW_SPRING` for anything smaller. */
export const CARD_SPRING = { type: "spring", stiffness: 260, damping: 34, mass: 1 }

/* Where a feed caption should stop, and whether there is anything past it.
 *
 * Two things can end the preview and **the earlier one wins**: the character budget, or the
 * author's first line break. The break matters because captions render with
 * `whitespace-pre-line` now — a body written as a list would otherwise spend the whole
 * preview on its first item and leave the "more" affordance stranded on a line of its own,
 * below a paragraph that had already visibly ended. Cutting at the break puts "more"
 * immediately after the last word of the first line, which is where a reader looking for it
 * would look.
 *
 * A break is already a clean boundary, so only the budget cut trims back to a word — doing it
 * on both would eat the last word of the first line for no reason.
 *
 * `\r?\n` rather than `\n`: a stray carriage return would otherwise survive the slice and
 * render as a blank line at the end of the preview.
 *
 * Returns `{ preview, truncated }`; `truncated` is what decides whether "more" is offered at
 * all, and it is not derivable from length alone — a short body with a break in it is
 * truncated, and a long one without is too. */
export function captionPreview(text, limit) {
    const body = String(text ?? "")
    const firstBreak = body.search(/\r?\n/)

    if (firstBreak !== -1 && firstBreak <= limit) {
        return { preview: body.slice(0, firstBreak), truncated: true }
    }

    if (body.length <= limit) return { preview: body, truncated: false }

    return { preview: body.slice(0, limit).replace(/\s+\S*$/, ""), truncated: true }
}

/* Bytes → the short string an attachment renders. Formatted at the edge rather than stored,
 * so the underlying number stays sortable and re-formattable.
 *
 * Shared with the server: `projectMedia` formats a post's document with this, and the
 * composer's optimistic row formats the file it just uploaded with the same function — so the
 * card cannot say "2.4 MB" before the server replies and "2.5 MB" after. */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return null
    if (bytes < 1024) return `${bytes} B`

    const units = ["KB", "MB", "GB"]
    let value = bytes / 1024
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/* An attachment's short type label ("pdf", "docx"), from the filename then the mime type.
 * Shared with the server for the same reason `formatBytes` is. */
export function documentType({ fileName, mimeType } = {}) {
    const fromName = fileName?.split(".").pop()?.toLowerCase()
    if (fromName && fromName !== fileName?.toLowerCase()) return fromName
    return mimeType?.split("/").pop()?.toLowerCase() ?? "file"
}

/* Compact tally for like/comment counts: 182 → "182", 2629 → "2.6K". */
export function formatCompact(n) {
    return Number(n ?? 0).toLocaleString("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
    })
}

/* Display label for an enum string.
 *
 * The API sends SCREAMING_SNAKE_CASE for roles, vocations, and membership statuses,
 * because that is what the Prisma enums are; the UI wants "Admin", "Faithful", "Pending".
 * Handles multi-word values ("HOLY_SYNOD" → "Holy Synod") so a new enum member does not
 * need a lookup table. */
/* Up to two letters for a group's gradient mark — "Holy Trinity Cathedral" → "HT".
 *
 * Splitting the name is right here and wrong for a person (see `initials` in lib/name.js):
 * an organization has one name and no parts to assemble it from, and the words in it are
 * the only structure available. A single-word name takes its first two letters instead, so
 * "Antiochian" reads as "AN" rather than a lone "A" that half the diocese would share. */
export function orgInitials(name) {
    const words = String(name ?? "").trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ""
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
}

export function roleLabel(role) {
    if (!role) return "User"
    return String(role)
        .toLowerCase()
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
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

/* "#rrggbb" → { r, g, b } (0–255). */
function hexToRgb(hex) {
    const value = parseInt(String(hex).replace("#", ""), 16)
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

/* "#rrggbb" → "rgba(r, g, b, a)". For canvas paint servers, where gradient stops
 * need a per-stop alpha and Tailwind tokens aren't available. */
export function withAlpha(hex, alpha) {
    const { r, g, b } = hexToRgb(hex)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
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
