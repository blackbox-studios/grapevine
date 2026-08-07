import { cn, hashColorScheme } from "@/lib/utils"

const BADGE_VARIANTS = {
    success:
        "text-success bg-success/10 border-success/30",
    destructive:
        "text-destructive bg-destructive/10 border-destructive/30",
    warning:
        "text-warning bg-warning/10 border-warning/30",
    info:
        "text-primary bg-primary/10 border-primary/25",
}

const Badge = ({ children, className, variant, ...props }) => (
    <span
        className={cn(
            "inline-flex h-6 items-center justify-center rounded-full border px-2.5 text-xxs tracking-wide font-semibold",
            variant ? BADGE_VARIANTS[variant] : hashColorScheme(children),
            className
        )}
        {...props}
    >
        {children}
    </span>
)

export default Badge
