import { appPath } from "@/lib/utils"
import { ConnectMetrcDialog } from "@/components/Dialog"

const ConnectPage = () => (
    <div className="flex flex-col gap-10 pb-10">

        <header className=" pb-12 flex flex-col gap-4">
            <h1 className="text-4xl font-semibold tracking-tight">
                Manage Connections
            </h1>
        </header>
        <section className="relative w-full min-h-[calc(100vh-420px)] rounded-5xl overflow-hidden flex flex-col items-center justify-center text-center px-6 py-20">
            <img
                src={appPath("/img/clouds.jpg")}
                alt="splatter"
                aria-hidden="true"
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover -z-1 opacity-80 dark:opacity-50"
            />
            <div
                aria-hidden="true"
                className="absolute inset-0 -z-1 "
            />

            <div className=" flex flex-col items-center gap-3 pb-[7%]">
                <h1 className="text-2xl text-white  tracking-tight font-serif italic">
                    Looks like you have no connections :(
                </h1>

                <p className="text-base leading-relaxed  [&_em]:font-serif  text-white/85 [&_em]:italic [&_em]:text-xl [&_em]:px-1">
                    Link your <em>Metrc</em> account so Ozora can sync your
                    compliance data and bring everything into one place.
                </p>

                <div className="pt-8">
                    <ConnectMetrcDialog />
                </div>
            </div>
        </section>
    </div>
)

export default ConnectPage
