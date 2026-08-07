import Icon from "@/components/Icon"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
