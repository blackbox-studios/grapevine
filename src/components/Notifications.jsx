"use client";

import { useState } from "react";
import { Ellipsis } from "lucide-react";
import BellIcon from "@/assets/svg/icons/bell-outline.svg";
import { cn } from "@/lib/utils";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const ACTIVITY = [
    {
        id: "alex-family-join",
        title: "New User",
        body: "A new user has joined Scrolls",
        timeLabel: "Yesterday",
        // Soft blue gradient disc, mirroring the design reference
        avatarClass:
            "bg-[radial-gradient(circle_at_30%_25%,#bfe1ff_0%,#5aa6f0_45%,#1f5fb5_100%)]",
    },
];

const REMINDERS = [];

function CountBadge({ children }) {
    return (
        <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-xs font-semibold leading-none text-white tabular-nums">
            {children}
        </span>
    );
}

function NotificationRow({ item }) {
    return (
        <div className="flex items-start gap-3 px-1 py-2.5">
            <div
                className={cn(
                    "h-10 w-10 shrink-0 rounded-full ring-2 ring-background",
                    item.avatarClass,
                )}
            />
            <div className="flex min-w-0 flex-1 items-start gap-2">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight text-foreground">
                        {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {item.body}
                    </p>
                </div>
                <span className="shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">
                    {item.timeLabel}
                </span>
            </div>
        </div>
    );
}

function EmptyState({ label }) {
    return (
        <div className="py-12 text-center text-sm text-muted-foreground">
            {label}
        </div>
    );
}

function NotificationList({ items, emptyLabel }) {
    if (items.length === 0) return <EmptyState label={emptyLabel} />;
    return (
        <ul className="divide-y divide-border/60">
            {items.map((item) => (
                <li key={item.id}>
                    <NotificationRow item={item} />
                </li>
            ))}
        </ul>
    );
}

export default function NotificationsPopover() {
    const [open, setOpen] = useState(false);
    const unreadCount = ACTIVITY.length;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Notifications"
                    className="relative -m-1 cursor-pointer rounded-full p-1 outline-hidden"
                >
                    <BellIcon />
                    {unreadCount > 0 && (
                        <span className="absolute top-0.5 right-0.5 h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-sidebar" />
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="right"
                align="end"
                sideOffset={16}
                className="w-88 gap-0 overflow-hidden p-2 h-[clamp(400px,50vh,600px)]"
            >
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                    <h3 className="text-lg font-semibold tracking-tight">
                        Notifications
                    </h3>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label="Notification options"
                                className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-muted-foreground outline-hidden hover:bg-accent hover:text-foreground"
                            >
                                <Ellipsis className="size-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            sideOffset={6}
                            className="min-w-44"
                        >
                            <DropdownMenuItem>Mark all as read</DropdownMenuItem>
                            <DropdownMenuItem>Notification settings</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive">
                                Clear all
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <Tabs defaultValue="activity" className="gap-0 px-4 pb-3">
                    <TabsList className="w-full">
                        <TabsTrigger value="activity">
                            Activity
                            {unreadCount > 0 && <CountBadge>{unreadCount}</CountBadge>}
                        </TabsTrigger>
                        <TabsTrigger value="reminders">Reminders</TabsTrigger>
                    </TabsList>

                    <TabsContent
                        value="activity"
                        className="mt-2 max-h-96 overflow-y-auto"
                    >
                        <NotificationList
                            items={ACTIVITY}
                            emptyLabel="No new activity"
                        />
                    </TabsContent>

                    <TabsContent
                        value="reminders"
                        className="mt-2 max-h-96 overflow-y-auto"
                    >
                        <NotificationList
                            items={REMINDERS}
                            emptyLabel="No reminders"
                        />
                    </TabsContent>
                </Tabs>
            </PopoverContent>
        </Popover>
    );
}
