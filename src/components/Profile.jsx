"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import VerifiedIcon from "@/assets/svg/icons/verified.svg";
import { useUser, useLogout } from "@/lib/store/auth/hook";
import { ROUTES } from "@/lib/constants";
import { roleLabel } from "@/lib/utils";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";


export default function ProfilePopover() {
    const [open, setOpen] = useState(false);
    const user = useUser();
    const { logout } = useLogout();
    const router = useRouter();

    const handleSettings = () => {
        setOpen(false);
        router.push(ROUTES.SETTINGS);
    };

    const handleLogout = () => {
        setOpen(false);
        logout();
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Account menu"
                    className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 border-current outline-hidden"
                >
                    <p className="font-semibold uppercase">
                        {user?.full_name ? user.full_name.trim()?.[0]?.toUpperCase() : "X"}
                    </p>
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="right"
                align="end"
                sideOffset={16}
                className="relative w-72 items-center gap-0 p-6 text-center"
            >
                <div
                    aria-hidden="true"
                    className="h-24 w-24 rounded-full shadow-md bg-[radial-gradient(circle_at_30%_25%,#bfe1ff_0%,#5aa6f0_45%,#1f5fb5_100%)]"
                />

                <div className="mt-5 flex items-baseline justify-center gap-2">
                    <h3 className="text-2xl font-semibold tracking-tight text-foreground">
                        {user?.full_name ?? "—"}
                    </h3>

                    <VerifiedIcon
                        aria-label="Verified"
                        className="shrink-0 text-foreground pb-px"
                    />

                </div>


                <p className="mt-0.5 text-sm text-muted-foreground">
                    {roleLabel(user?.role)}
                </p>


                {user?.email && (
                    <p className="mt-1 text-sm text-foreground">{user.email}</p>
                )}

                <div className="mt-6 grid w-full grid-rows-2 gap-3">
                    <Button variant="outline" size="lg" type="button" onClick={handleSettings}>
                        Settings
                    </Button>
                    <Button
                        variant="destructive"
                        size="lg"
                        type="button"
                        onClick={handleLogout}
                    >
                        Logout
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
