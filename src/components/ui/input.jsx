import * as React from "react"

import { cn } from "@/lib/utils"
import Icon from "@/components/Icon";

function Input({
    className,
    type,
    icon,
    ...props
}) {
    const id = React.useId()
    return (
        <div className="relative w-inherit">
            <input
                id={id}
                type={type}
                data-slot="input"
                className={cn("h-12 w-full min-w-0 rounded-full bg-muted px-5 pr-4 py-1 text-base  transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
                    icon && "border-transparent bg-muted pl-12  ",
                    className
                )}
                {...props} />
            {icon &&
                <Icon size="lg" className="pointer-events-none absolute  left-5 top-1/2 -translate-y-1/2 text-muted-foreground/50">
                    {icon}
                </Icon>
            }
        </div>
    );
}

export { Input }
