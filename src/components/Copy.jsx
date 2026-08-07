"use client"

import copy from "copy-to-clipboard"
import { useState } from "react"
import { toast } from "sonner"

import Icon from "@/components/Icon"
import { cn } from "@/lib/utils"

const Copy = ({ children, toCopy, className, ...props }) => {
    const [copied, setCopied] = useState(false)

    const onCopy = () => {
        try {
            copy(toCopy ?? "")
            setCopied(true)
            toast.success("Code copied successfully")
        } catch (e) {
            console.error("error copying:", e)
            toast.error("Failed to copy")
        }
    }

    return (
        <div className={cn("relative", className)} {...props}>
            {children}
            <button
                type="button"
                aria-label={copied ? "Copied" : "Copy to clipboard"}
                onClick={onCopy}
                className="absolute top-2 right-3 z-20 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
                <Icon size="md">{copied ? "check" : "content_paste"}</Icon>
            </button>
        </div>
    )
}

export default Copy
