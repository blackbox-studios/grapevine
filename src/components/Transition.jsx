"use client"

import { motion, useReducedMotion } from "motion/react"
import { cn, transition } from "@/lib/utils"


const Transition = ({ children, className, fast, slow, delay, ...props }) => {
    const shouldReduceMotion = useReducedMotion()

    return (
        <motion.div {...transition(shouldReduceMotion, fast ? 0.2 : slow ? 0.4 : null, delay)} className={cn("relative w-full h-full", className)} {...props}>
            {children}
        </motion.div>
    )
}

export default Transition;