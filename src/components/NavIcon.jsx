import { cn } from "@/lib/utils";

/* Crossfades between an outlined and a filled variant of the same glyph.
 * `active` shows the filled icon; both are stacked so the swap fades rather
 * than pops. */
export default function NavIcon({ Outline, Filled, active, className }) {
    return (
        <span className={cn("relative block w-6 h-6", className)}>
            <Outline
                aria-hidden="true"
                className={cn(
                    "absolute inset-0 w-6 h-6 transition-opacity duration-300 ease-in-out",
                    active ? "opacity-0" : "opacity-100",
                )}
            />
            <Filled
                aria-hidden="true"
                className={cn(
                    "absolute inset-0 w-6 h-6 transition-opacity duration-300 ease-in-out",
                    active ? "opacity-100" : "opacity-0",
                )}
            />
        </span>
    );
}
