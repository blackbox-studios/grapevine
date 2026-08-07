import Link from "next/link"

import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  ...props
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-2xl border border-border/70 bg-card py-(--card-spacing) text-sm text-card-foreground shadow-xs [--card-spacing:--spacing(6)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] *:[img:first-child]:rounded-t-2xl *:[img:last-child]:rounded-b-2xl",
        className
      )}
      {...props} />
  );
}

function CardHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-2xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props} />
  );
}

function CardTitle({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-normal font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props} />
  );
}

function CardDescription({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props} />
  );
}

function CardAction({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props} />
  );
}

function CardContent({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props} />
  );
}

function CardFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-2xl px-(--card-spacing) [.border-t]:pt-(--card-spacing)",
        className
      )}
      {...props} />
  );
}

function ActionCard({
  to,
  ariaLabel,
  className,
  children,
  ...props
}) {
  return (
    <Card
      className={cn(
        "group relative gap-0 py-0 transition-colors duration-500",
        "[--circle-draw:100]",
        "hover:[--circle-draw:0] hover:bg-secondary/5",
        "has-[button:hover]:[--circle-draw:100] has-[button:hover]:bg-card",
        className,
      )}
      {...props}
    >
      <Link
        href={to}
        aria-label={ariaLabel}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-secondary"
      />
      <div className="pointer-events-none relative z-20 flex flex-1 flex-col [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        {children}
      </div>
    </Card>
  );
}

export {
  ActionCard,
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
