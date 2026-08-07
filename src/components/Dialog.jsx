"use client"

import { useState } from "react"
import Arrow from "@/assets/svg/icons/arrow.svg"
import { appPath, cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Icon from "@/components/Icon"
import Transition from "@/components/Transition"
import Hyperlink from "@/components/Hyperlink"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"

const STEPS = [
    { src: "/video/metrc-api-click.mp4", label: "Open the API settings" },
    { src: "/video/generate-key.mp4", label: "Generate your key" },
]

export const ConnectMetrcDialog = () => {
    const [open, setOpen] = useState(false)
    const [apiKey, setApiKey] = useState("")
    const [show, setShow] = useState(false)

    const handleSave = (e) => {
        e.preventDefault()
        if (!apiKey.trim()) return

        // TODO: persist to store / backend once the Metrc API is wired in.
        console.log("Saving Metrc API key", apiKey)

        setApiKey("")
        setShow(false)
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {/* Preload the tutorial clips ahead of time (React hoists these to <head>). */}
            {STEPS.map((step) => (
                <link
                    key={step.src}
                    rel="preload"
                    as="fetch"
                    href={appPath(step.src)}
                />
            ))}

            <DialogTrigger asChild>
                <Button
                    className={cn(
                        "group inline-flex items-center gap-2 w-fit rounded-full bg-white text-[#758090] px-12 py-6 hover:bg-white/80",
                    )}
                >
                    Connect Metrc
                    <Arrow className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Button>
            </DialogTrigger>

            <DialogContent>
                <Collapsible>
                    <DialogHeader>
                        <DialogTitle>Connect Metrc</DialogTitle>
                        <DialogDescription asChild>
                            <div>
                                Paste your Metrc API key so Ozora can sync your
                                compliance data. You can revoke it any time from
                                your Metrc account.&nbsp;&nbsp;
                                <CollapsibleTrigger asChild>
                                    <Hyperlink className="cursor-pointer items-center gap-0.5 align-baseline">
                                        Learn how
                                        <Icon
                                            size="md"
                                            className="align-middle transition-transform duration-200 group-data-[state=open]:rotate-180 mb-0.5 ml-0.5"
                                        >
                                            arrow_circle_down
                                        </Icon>
                                    </Hyperlink>
                                </CollapsibleTrigger>
                            </div>
                        </DialogDescription>
                    </DialogHeader>

                    <CollapsibleContent className="flex flex-col gap-3 pt-4">
                        {STEPS.map((step, i) => (
                            <Transition
                                key={step.src}
                                slow
                                delay={0.15 + i * 0.2}
                                className="h-auto"
                            >
                                <figure className="flex flex-col gap-2">
                                    <div className="relative overflow-hidden rounded-2xl bg-muted">
                                        <video
                                            src={appPath(step.src)}
                                            autoPlay
                                            loop
                                            muted
                                            playsInline
                                            preload="auto"
                                            className="aspect-video w-full object-cover"
                                        />
                                        <span className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/60 text-xs font-medium text-white">
                                            {i + 1}
                                        </span>
                                    </div>
                                    <figcaption className="text-xs text-muted-foreground">
                                        {step.label}
                                    </figcaption>
                                </figure>
                            </Transition>
                        ))}
                    </CollapsibleContent>
                </Collapsible>

                <form onSubmit={handleSave} className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="metrc-api-key">API key</Label>
                        <div className="relative w-full">
                            <Input
                                id="metrc-api-key"
                                type={show ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder="Enter your Metrc API key"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="pr-12"
                            />
                            <button
                                type="button"
                                onClick={() => setShow((v) => !v)}
                                aria-label={show ? "Hide API key" : "Show API key"}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                            >
                                <Icon size="md">
                                    {show ? "visibility_off" : "visibility"}
                                </Icon>
                            </button>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button size="lg" type="submit" disabled={!apiKey.trim()} className="px-12 mx-auto w-full mt-2">
                            Save key
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
