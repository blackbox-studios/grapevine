"use client"

import { Toaster } from "sonner"

import { ThemeProvider, TooltipProvider, ScrollProvider } from "@/lib/providers"

/* Context providers shared by the whole app. next-themes handles the theme class on
 * <html> and the no-flash script (requires suppressHydrationWarning on <html> in the
 * root layout). */
export default function Providers({ children }) {
    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="synaxis-ui-theme"
            disableTransitionOnChange
        >
            <TooltipProvider>
                <ScrollProvider>
                    <Toaster richColors toastOptions={{ classNames: { toast: "!rounded-2xl" } }} />
                    {children}
                </ScrollProvider>
            </TooltipProvider>
        </ThemeProvider>
    )
}
