import Icon from "@/components/Icon"
import { Button } from "@/components/ui/button"
import { initials } from "@/lib/name"
import { appPath, cn, gradientFor, orgInitials } from "@/lib/utils"

/* User/author avatar. Uses the profile image when one is provided; otherwise falls back to
 * a deterministic gradient (via gradientFor()) with the person's initials. Size it with a
 * `size-*` class via `className`.
 *
 * **Takes the person, not a name string.** Initials come from `firstName`/`lastName`
 * directly, because a rendered display name may lead with a title — splitting "Dn. Paul"
 * gives "DP", which is neither of his names. The gradient is keyed on the handle rather
 * than the name for the same reason it is stable at all: a handle identifies one person,
 * where two Anna's would otherwise share a colour and one person changing their name would
 * change theirs. */
export const Avatar = ({ person, className }) =>
    person?.avatar ? (
        <img
            src={appPath(person.avatar)}
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
            style={gradientFor(person?.handle)}
            aria-hidden="true"
        >
            {initials(person)}
        </span>
    )

/* A group's mark, for the switcher and anywhere else a parish is listed.
 *
 * Separate from <Avatar/> rather than a variant of it because the two derive their fallback
 * from different things and neither derivation works on the other's shape: a person's
 * initials come from name *parts* that an organization does not have, and an organization's
 * come from words in a single name ("Holy Trinity Cathedral" → "HT"), which is exactly the
 * split-the-display-name approach <Avatar/> exists to avoid for people. The gradient is
 * keyed on the slug for the same reason a person's is keyed on their handle: one stable
 * identifier per group, so renaming a parish does not recolour it. */
export const OrgAvatar = ({ org, className }) =>
    org?.avatar ? (
        <img
            src={appPath(org.avatar)}
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
            style={gradientFor(org?.slug ?? org?.id)}
            aria-hidden="true"
        >
            {orgInitials(org?.name)}
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
