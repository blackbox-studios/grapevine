import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";


const iconVariants = cva(
    "material-symbols-rounded select-none",
    {
        variants: {
            size: {
                default: "!text-xl",
                xxs: "!text-xs",
                xs: "!text-sm",
                sm: "!text-base",
                md: "!text-lg",
                lg: "!text-2xl",
                xl: "!text-3xl",
            },
        },

        defaultVariants: {
            size: "default",
        },
    }
)

const Icon = ({ ref, className, size, children, ...props }) => {
    return (
        <span className={cn(iconVariants({ size, className }))} {...props} ref={ref}>
            {children}
        </span>
    )
}

export default Icon;