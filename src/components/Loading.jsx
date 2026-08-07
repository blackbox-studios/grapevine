"use client"

import SpinnerSvg from "@/assets/svg/spinner.svg"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"

export const Spinner = ({ className, ...props }) => {
    return (
        <SpinnerSvg className={cn("w-16 mb-12 origin-center animate-[spin_0.4s_linear_infinite] direction-[reverse] ", className)} {...props}/>
    )
}

const LoadingPage = () => {
    return (
        <div className="flex items-center justify-center w-full h-full pt-[33vh]">
            <Spinner />
        </div>
    )
}

export const LoadOverlay = ({ loading = false }) => {

    /* Prevent flashing with minimum delay */
    const [delay, setDelay] = useState(true)
    useEffect(() => {
        const t = setTimeout(() => {
            setDelay(false)
        }, 1000)
        return () => clearTimeout(t)
    }, [])

    return (
        <AnimatePresence>
            {(delay || loading) && <motion.div className="fixed z-1000 top-0 right-0 w-full h-full bg-background flex items-center justify-center" key="load-overlay" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <Spinner />
            </motion.div>}
        </AnimatePresence>
    )
}

export default LoadingPage
