import { Children, createContext, useContext, useState } from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/* Mirrors the Radix value so TabsList can compute the active child's index
 * without needing the consumer to thread it through. */
const TabsContext = createContext({ value: undefined })

function Tabs({
	className,
	orientation = "horizontal",
	value,
	defaultValue,
	onValueChange,
	...props
}) {
	const [tracked, setTracked] = useState(value ?? defaultValue)

	/* Controlled usage: keep `tracked` in sync with the `value` prop by
	 * adjusting state during render — React's supported pattern for deriving
	 * state from props. It re-renders immediately with the new value before
	 * committing, avoiding both the extra layout-effect paint flash and the
	 * set-state-in-effect lint. */
	if (value !== undefined && value !== tracked) {
		setTracked(value)
	}

	const handleChange = (v) => {
		setTracked(v)
		onValueChange?.(v)
	}

	return (
		<TabsContext.Provider value={{ value: tracked }}>
			<TabsPrimitive.Root
				data-slot="tabs"
				data-orientation={orientation}
				value={value}
				defaultValue={defaultValue}
				onValueChange={handleChange}
				className={cn(
					"group/tabs relative grid",
					"data-horizontal:grid-cols-1",
					"data-vertical:grid-rows-1",
					className,
				)}
				{...props} />
		</TabsContext.Provider>
	);
}

function TabsList({
	className,
	children,
	style,
	...props
}) {
	const { value } = useContext(TabsContext)

	/* Assumes triggers are equal-width (flex-1 on TabsTrigger) and direct
	 * children of TabsList. The indicator's width/position is derived from
	 * --tab-count and --tab-active-index via calc() — no JS measurement. */
	const childArray = Children.toArray(children)
	const count = childArray.length || 1
	const activeIndex = Math.max(
		0,
		childArray.findIndex((c) => c?.props?.value === value),
	)

	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			style={{
				"--tab-count": count,
				"--tab-active-index": activeIndex,
				...style,
			}}
			className={cn(
				"group/tabs-list relative inline-flex w-fit items-center justify-center rounded-full bg-muted py-[3px] px-1 text-muted-foreground group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
				className,
			)}
			{...props}
		>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-[3px] left-1 w-[calc((100%-0.5rem)/var(--tab-count))] translate-x-[calc(var(--tab-active-index)*100%)] rounded-full bg-background shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.5,0,0,1)] dark:border dark:border-input dark:bg-input/30"
			/>
			{children}
		</TabsPrimitive.List>
	);
}

function TabsTrigger({
	className,
	...props
}) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"relative z-10 cursor-pointer select-none inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 py-1 text-button font-medium whitespace-nowrap text-foreground/60 transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 dark:text-muted-foreground dark:hover:text-foreground data-active:text-foreground dark:data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className
			)}
			{...props} />
	);
}

function TabsContent({
	className,
	value,
	...props
}) {
	/* `forceMount` keeps every panel in the DOM so we can cross-fade without
	 * unmounting children. Panels overlap in the same grid cell — row 2 for
	 * horizontal tabs, column 2 for vertical — so only the active one is
	 * visible while inactive ones fade in place. The `inert` attribute pulls
	 * inactive panels out of the tab order and pointer routing — the
	 * data-[state=inactive] CSS only hides them visually.
	 *
	 * **An inactive panel is out of flow, so it cannot set the page's height.** The panels
	 * share one grid cell, so an in-flow one sizes that cell whatever its opacity — leaving
	 * a page as tall as its tallest panel and scrolling past nothing. `absolute` takes the
	 * inactive ones out of the sizing; they keep `col-start`/`row-start` so each resolves
	 * against its own grid area, which is what the `relative` on the root is for.
	 *
	 * `overflow-hidden` on them is load-bearing rather than cosmetic: content overflowing an
	 * absolutely positioned box still counts toward an ancestor scroller's scrollable
	 * overflow. The cost is that a taller outgoing panel is clipped to the incoming one's
	 * height for the 200ms it fades. */
	const { value: activeValue } = useContext(TabsContext)
	const isActive = activeValue === value

	return (
		<TabsPrimitive.Content
			value={value}
			forceMount
			data-slot="tabs-content"
			inert={!isActive}
			className={cn(
				"text-sm outline-none transition-opacity duration-200",
				"group-data-horizontal/tabs:col-start-1 group-data-horizontal/tabs:row-start-2",
				"group-data-vertical/tabs:col-start-2 group-data-vertical/tabs:row-start-1",
				"data-[state=active]:opacity-100",
				"data-[state=inactive]:pointer-events-none data-[state=inactive]:opacity-0",
				"data-[state=inactive]:absolute data-[state=inactive]:inset-0 data-[state=inactive]:overflow-hidden",
				className,
			)}
			{...props} />
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
