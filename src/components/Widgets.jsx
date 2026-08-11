import Icon from "@/components/Icon"
import { Button } from "@/components/ui/button"
import { appPath, cn, gradientFor } from "@/lib/utils"

/* Up-to-two-letter initials from a display name, for the gradient avatar fallback. */
const initials = (name) =>
    String(name ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()

/* User/author avatar. Uses the profile image when one is provided; otherwise falls
 * back to a deterministic gradient (via gradientFor()) with the name's initials.
 * Size it with a `size-*` class via `className`. */
export const Avatar = ({ name, src, className }) =>
    src ? (
        <img
            src={appPath(src)}
            alt=""
            aria-hidden="true"
            className={cn("shrink-0 rounded-full object-cover", className)}
        />
    ) : (
        <span
            className={cn(
                "flex shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold text-white",
                className,
            )}
            style={gradientFor(name)}
            aria-hidden="true"
        >
            {initials(name)}
        </span>
    )

export const Close = ({ className, children, ...props }) => (
    <Button
        type="button"
        variant="ghost"
        aria-label="Close"
        className={cn(
            "flex size-9 rounded-full border-none bg-background shadow-[4px_4px_10px_4px_rgba(0,0,0,0.12)] hover:bg-muted",
            className,
        )}
        {...props}
    >
        {children ?? <Icon>close</Icon>}
    </Button>
)

export const YayOrNay = ({ value }) =>
    value ? (
        <Icon size="md" className="text-success" aria-label="check">check</Icon>
    ) : (
        <Icon size="md" className="text-destructive" aria-label="x">close</Icon>
    )
