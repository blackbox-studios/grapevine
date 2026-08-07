import { cn } from "@/lib/utils";
import { useReducedMotion } from "motion/react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui"

function Collapsible({
  ...props
}) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  ...props
}) {
  return (<CollapsiblePrimitive.CollapsibleTrigger data-slot="collapsible-trigger" {...props} />);
}

function CollapsibleContent({ className, children, ...props }) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      className={cn(
        !shouldReduceMotion && "overflow-hidden transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
      )}
      {...props}
    >
      <div className={cn(className)}>{children}</div>
    </CollapsiblePrimitive.CollapsibleContent>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
