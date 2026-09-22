import { Children, createContext, useContext, useEffect, useId, useState } from "react"
import { motion } from "motion/react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/* Two looks, one control.
 *
 * `pill` is the segmented track — a plate that slides between equal-width triggers, sized off
 * `--tab-count` in pure CSS. It is the default and what a card uses, where the bar is chrome
 * hugging a container's edge and the two halves are peers.
 *
 * `underline` is a rule under the active label, the shape a phone uses at the head of a page.
 * The triggers are content-width there, so the indicator has to *measure* rather than divide:
 * it is one `layoutId` element rendered inside whichever trigger is active, and motion moves
 * and resizes it between the two as React unmounts one and mounts the other. That is the whole
 * reason this one is not CSS — an underline that matched "Calendar" and "Sign-ups" equally
 * would have to be as wide as the wider word under both.
 *
 * Both indicators travel on the same curve, because they are the same control wearing two
 * styles and should move alike. */
const INDICATOR_TRANSITION = { duration: 0.3, ease: [0.5, 0, 0, 1] }

/* How long a panel takes to cross-fade, and how long it stays in flow on its way out. One
 * constant because `<TabsContent/>` needs the two to be the same number; see its header. */
const FADE_MS = 200

/* Mirrors the Radix value so TabsList can compute the active child's index
 * without needing the consumer to thread it through. */
const TabsContext = createContext({ value: undefined })

/* What the bar looks like, and the key its indicator travels under. Provided by TabsList
 * because the variant is its prop, and read by TabsTrigger because that is where the underline
 * is drawn. `indicator` is per bar (`useId`), so two tab bars on one screen never trade
 * indicators — a `layoutId` is a global registry key, not a scoped one. */
const TabsListContext = createContext({ variant: "pill", indicator: undefined })

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
	variant = "pill",
	...props
}) {
	const { value } = useContext(TabsContext)
	const indicator = useId()

	/* Pill only. Assumes triggers are equal-width (flex-1 on TabsTrigger) and
	 * direct children of TabsList. The plate's width/position is derived from
	 * --tab-count and --tab-active-index via calc() — no JS measurement. The
	 * underline cannot work this way; see the header. */
	const childArray = Children.toArray(children)
	const count = childArray.length || 1
	const activeIndex = Math.max(
		0,
		childArray.findIndex((c) => c?.props?.value === value),
	)

	const pill = variant === "pill"

	return (
		<TabsListContext.Provider value={{ variant, indicator }}>
			<TabsPrimitive.List
				data-slot="tabs-list"
				data-variant={variant}
				style={pill ? {
					"--tab-count": count,
					"--tab-active-index": activeIndex,
					...style,
				} : style}
				className={cn(
					"group/tabs-list relative inline-flex items-center group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
					pill
						? "w-fit justify-center rounded-full bg-muted py-[3px] px-1 text-muted-foreground"
						/* No track and no plate, so the bar is only as tall as the labels and
						 * `gap-6` is the whole of its rhythm. `items-start` on the vertical
						 * orientation because a column of rules should hang off the left edge
						 * rather than centre under labels of different lengths. */
						: "justify-start gap-6 group-data-vertical/tabs:items-start",
					className,
				)}
				{...props}
			>
				{pill && (
					<span
						aria-hidden="true"
						className="pointer-events-none absolute inset-y-[3px] left-1 w-[calc((100%-0.5rem)/var(--tab-count))] translate-x-[calc(var(--tab-active-index)*100%)] rounded-full bg-background shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.5,0,0,1)] dark:border dark:border-input dark:bg-input/30"
					/>
				)}
				{children}
			</TabsPrimitive.List>
		</TabsListContext.Provider>
	);
}

function TabsTrigger({
	className,
	children,
	value,
	...props
}) {
	const { value: active } = useContext(TabsContext)
	const { variant, indicator } = useContext(TabsListContext)
	const underline = variant === "underline"

	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			value={value}
			className={cn(underline ? "relative cursor-pointer select-none inline-flex h-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-1 text-base font-semibold text-muted-foreground transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4" : "relative z-10 cursor-pointer select-none inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 py-1 text-button font-medium whitespace-nowrap text-foreground/60 transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 dark:text-muted-foreground dark:hover:text-foreground data-active:text-foreground dark:data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", className)}
			{...props}
		>
			{underline ? (
				/* The rule hangs off the **label**, not off the trigger, so it is a fraction of
				 * the word rather than a fraction of the word plus its padding — which is what
				 * keeps it looking deliberate under a short title and a long one alike.
				 *
				 * Rendered only while active. That is the mechanism rather than a shortcut: one
				 * element exists at a time under a shared `layoutId`, so React unmounting it
				 * here and mounting it there is exactly the event motion animates between. */
				<span className="relative">
					{children}
					{active === value && (
						<motion.span
							layoutId={indicator}
							aria-hidden="true"
							transition={INDICATOR_TRANSITION}
							className="absolute inset-x-[12%] -bottom-1.5 h-0.5 rounded-full bg-foreground"
						/>
					)}
				</span>
			) : (
				children
			)}
		</TabsPrimitive.Trigger>
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
	 * **The end lines are spelled out because an `auto` one is not the grid area.** An
	 * absolutely positioned grid child has its containing block *expanded into the grid
	 * container's padding* on every side its placement leaves `auto` (CSS Grid §9.2), so a
	 * `<Tabs/>` with padding gave the inactive panels a box wider and taller than the active
	 * one. The outgoing panel then jumped that far the instant it went inactive and shifted
	 * its contents sideways for the length of the fade. `span 1` pins all four edges to the
	 * cell, and costs the in-flow panel nothing — it already spans one.
	 *
	 * `overflow-hidden` on a parked panel is load-bearing rather than cosmetic: content
	 * overflowing an absolutely positioned box still counts toward an ancestor scroller's
	 * scrollable overflow.
	 *
	 * ── A panel is parked only once it has finished fading ──
	 *
	 * Taking a panel out of flow is what stops it sizing the cell, and clipping it is what
	 * stops it extending the page. Both are statements about a panel nobody is looking at —
	 * and doing either to one that is still on screen is what cuts the outgoing panel off at
	 * the incoming one's edges, top to bottom and side to side, for exactly as long as it is
	 * visible. There is no third option while the cell is the height of the active panel:
	 * anything taller is either clipped or extends the page.
	 *
	 * So it stays in flow until it is transparent. For the length of the fade both panels are
	 * ordinary grid items sharing one cell, which makes the cell as tall as the taller of them
	 * and leaves the outgoing one whole; the moment it is invisible it is parked, and the cell
	 * collapses to the active panel. The collapse is not seen, because the only thing that
	 * shrank is something nobody can see any more.
	 *
	 * `FADE_MS` drives the timer *and* the transition, so the two cannot drift apart into a
	 * panel that parks before it has faded (a flash of clipping) or long after (a page that
	 * stays too tall). */
	const { value: activeValue } = useContext(TabsContext)
	const isActive = activeValue === value

	const [leaving, setLeaving] = useState(false)
	const [wasActive, setWasActive] = useState(isActive)

	/* Adjusted during render rather than in an effect — the same pattern `<Tabs/>` above uses
	 * to track the controlled value, and for the same reason: the panel has to be in flow on
	 * the very frame it goes inactive, and an effect would park it for one paint first. Going
	 * the other way sets `leaving` false, so coming back mid-fade cancels the wait. */
	if (wasActive !== isActive) {
		setWasActive(isActive)
		setLeaving(wasActive && !isActive)
	}

	useEffect(() => {
		if (!leaving) return
		const timer = setTimeout(() => setLeaving(false), FADE_MS)
		return () => clearTimeout(timer)
	}, [leaving])

	/* Out of flow and clipped. Never true for a panel that is still visible. */
	const parked = !isActive && !leaving

	return (
		<TabsPrimitive.Content
			value={value}
			forceMount
			data-slot="tabs-content"
			inert={!isActive}
			style={{ transitionDuration: `${FADE_MS}ms` }}
			className={cn(
				"text-sm outline-none transition-opacity",
				"group-data-horizontal/tabs:col-start-1 group-data-horizontal/tabs:row-start-2",
				"group-data-vertical/tabs:col-start-2 group-data-vertical/tabs:row-start-1",
				"col-end-[span_1] row-end-[span_1]",
				isActive ? "opacity-100" : "pointer-events-none opacity-0",
				parked && "absolute inset-0 overflow-hidden",
				className,
			)}
			{...props} />
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
