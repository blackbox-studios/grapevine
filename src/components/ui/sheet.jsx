import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Close } from "@/components/Widgets"

function Sheet({
  ...props
}) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 duration-100 bg-[linear-gradient(90deg,rgba(12,0,65,0.05)_0%,rgba(10,0,57,0.20)_17.36%,rgba(0,0,0,0.50)_100%)] dark:bg-[linear-gradient(90deg,rgb(22_27_95/5%)_0%,rgb(58_53_78/20%)_17.36%,rgb(56_57_81/67%)_80%,rgb(33_34_55/83%)_100%)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props} />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-xl transition duration-200 ease-in-out",
          /* Per-side positioning. Every sheet sits inset from the viewport edges
           * with fully rounded corners so the bubble + dim overlay reads like a
           * floating panel rather than a flush drawer. */
          "data-[side=right]:inset-y-(--bumper) data-[side=right]:right-(--bumper) data-[side=right]:h-[calc(100vh-(2*var(--bumper)))] data-[side=right]:w-[calc(100vw-(2*var(--bumper)))] data-[side=right]:rounded-3xl data-[side=right]:sm:max-w-xl",
          "data-[side=left]:inset-y-(--bumper) data-[side=left]:left-(--bumper) data-[side=left]:h-[calc(100vh-(2*var(--bumper)))] data-[side=left]:w-[calc(100vw-(2*var(--bumper)))] data-[side=left]:rounded-3xl data-[side=left]:sm:max-w-xl",
          "data-[side=top]:inset-x-(--bumper) data-[side=top]:top-(--bumper) data-[side=top]:max-h-[calc(100vh-(2*var(--bumper)))] data-[side=top]:rounded-3xl",
          "data-[side=bottom]:inset-x-(--bumper) data-[side=bottom]:bottom-(--bumper) data-[side=bottom]:max-h-[calc(100vh-(2*var(--bumper)))] data-[side=bottom]:rounded-3xl",
          /* Open / close animations (preserved from the base shadcn sheet). */
          "data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10",
          "data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
          className
        )}
        {...props}>
        {/* Decorative top-right bubble. Sits just outside the panel so the
         * rounded corner reads as a layered surface against the dim overlay. */}
        <span
          aria-hidden="true"
          data-slot="sheet-bubble"
          className="pointer-events-none absolute -top-[calc(var(--bumper)-4px)] -right-[calc(var(--bumper)-4px)] size-4 rounded-full bg-background shadow-md ring-1 ring-border"
        />

        {children}

        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Close
              aria-label="Close sheet"
              className="absolute top-5 left-5"
            />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props} />
  );
}

function SheetFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props} />
  );
}

function SheetTitle({
  className,
  ...props
}) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading font-medium text-foreground", className)}
      {...props} />
  );
}

function SheetDescription({
  className,
  ...props
}) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props} />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
