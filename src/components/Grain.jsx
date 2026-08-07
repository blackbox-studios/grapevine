import { cn } from "@/lib/utils";
import { memo } from "react";

const Grain = memo(({ className, ...props }) => {
    return (<div className={cn("fixed z-0 pointer-events-none w-full h-full bg-[url('/grain.png')] bg-repeat opacity-[0.06] bg-[size:109px] mix-blend-exclusion", className)} {...props} />)
})

export default Grain