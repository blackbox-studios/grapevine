import Link from "next/link"
import NodeIcon from "@/assets/svg/icons/node.svg"
import AppsIcon from "@/assets/svg/icons/apps.svg"
import Arrow from "@/assets/svg/icons/arrow.svg"
import { ROUTES } from "@/lib/constants"
import { appPath, cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"


const DASHBOARD_CARDS = [
    {
        id: "inbox",
        gradient: appPath("/gradient-1.jpg"),
        Icon: NodeIcon,
        color: "oklch(53% 11% 227deg)",
        title: "Open your inbox",
        description: (
            <>
                Catch up on <em>messages</em> from the people and groups you follow.
            </>
        ),
        cta: "Go to Inbox",
        to: ROUTES.INBOX,
    },
    {
        id: "groups",
        gradient: appPath("/gradient-2.jpg"),
        Icon: AppsIcon,
        color: "oklch(49% 3% 45deg)",
        title: "Browse Groups",
        description: (
            <>
                Find and join <em>groups</em> that match what you're into.
            </>
        ),
        cta: "View Groups",
        to: ROUTES.GROUPS,
    },
]

const HomePage = () => {
    return (
        <div className="flex flex-col gap-10 pb-10">
            <header className="border-b pb-12 flex flex-col gap-4">
                <h1 className="text-4xl font-medium font-[Tangerine] ">
                    Dashboard
                </h1>
                <p className="leading-normal text-muted-foreground">
                    Scrolls demo mode. All data is dummy and disconnected. Feel free to click around.
                </p>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:px-2">
                {DASHBOARD_CARDS.map(({ id, gradient, Icon, color, title, description, cta, to }) => (
                    <div
                        key={id}
                        className="relative w-full min-h-62 rounded-5xl overflow-hidden px-6 py-5 grid grid-rows-[auto_1fr_auto] gap-6.5"
                    >
                        <img
                            src={gradient}
                            alt="gradient"
                            aria-hidden="true"
                            className="absolute inset-0 w-full h-full object-cover -z-1 dark:opacity-50"
                        />

                        <div
                            className="flex items-center justify-center w-9 h-9 rounded-full bg-white"
                            style={{ color }}
                        >
                            <Icon className="w-4 h-4" />
                        </div>
                        <div className="mt-auto pl-2">
                            <h2 className="text-lg font-medium text-white mb-1">
                                {title}
                            </h2>
                            <p className=" text-white/85 leading-tight [&_em]:font-serif [&_em]:italic [&_em]:text-lg [&_em]:px-1">
                                {description}
                            </p>
                        </div>
                        <div className="h-fit mt-auto">
                            <Link href={to}>
                                <Button
                                    className={cn(
                                        "inline-flex items-center gap-2 w-fit rounded-full bg-white text-foreground px-7 py-6 hover:bg-white/80",
                                    )}
                                    style={{ color }}
                                >
                                    {cta}
                                    <Arrow className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                ))}
            </section>
        </div>
    )
}

export default HomePage
