import Copy from "@/components/Copy"
import { cn } from "@/lib/utils"

const Code = ({ children, className, maxHeight, ...props }) => {
    const text = typeof children === "string" ? children : String(children ?? "")

    return (
        <Copy
            toCopy={text}
            className={cn(
                "rounded-2xl bg-muted/60 text-xs text-foreground/80",
                className,
            )}
            {...props}
        >
            <pre
                className="overflow-auto whitespace-pre-wrap break-all px-5 py-4 pr-12 font-mono leading-relaxed"
                style={maxHeight ? { maxHeight } : undefined}
            >
                {text}
            </pre>
        </Copy>
    )
}

export default Code
