"use client"

import { useSyncExternalStore } from "react"

import { BackHeader } from "@/components/BackHeader"
import GlossyMark, { MARK_ENTRANCE_DELAY, useMarkCycle } from "@/components/GlossyMark"
import Hyperlink from "@/components/Hyperlink"
import Transition from "@/components/Transition"
import { useEntered } from "@/lib/hooks/useEntered.hook"
import { APP_BUILD, APP_VERSION, ROUTES } from "@/lib/constants"

/* Which copy of Grapevine this is, and who stands behind it. A version is looked up rather
 * than read, so nothing on the page is louder than it has to be. */

/* The copyright year, which the clock cannot be asked for during render.
 *
 * This page prerenders to static HTML in both build targets, so a year read there is the build
 * machine's, and a browser reaching a different one on its first render is a hydration mismatch.
 * `useSyncExternalStore` is this repo's answer to a client-only value (see `useMounted`): the
 * server snapshot is the year off the front of `APP_BUILD`'s `YYMMDDHHMM`, already sitting in
 * that HTML, and the client snapshot is what the reader sees. The second is the half that
 * matters to them, since a native bundle can sit on a phone for months and a copyright a year
 * stale is the one line here somebody would notice. Both are numbers, so the identity check
 * React makes between the two settles at once. */
const emptySubscribe = () => () => {}
const currentYear = () => new Date().getFullYear()
const buildYear = () => 2000 + Number(APP_BUILD.slice(0, 2))

const MAKER = { name: "Blackbox Studios", url: "https://blackboxstudios.com" }
const PARISH = {
    name: "Holy Trinity Chicago",
    url: "https://holytrinitycathedral.net",
}

/* An address outside the app. Not `soft`, which is the variant for a link inside prose: these
 * two names are the only thing on the page that can be tapped, and an affordance that appears
 * on hover appears never on a phone. */
const Out = ({ to }) => (
    <Hyperlink href={to.url} target="_blank" rel="noreferrer">
        {to.name}
    </Hyperlink>
)

const SettingsAboutPage = () => {
    const { from, to, advance } = useMarkCycle()
    /* The same flag the mark flies in on. This page sits under `<PageTransition initial={false}/>`,
     * so on a cold load Motion skips every `initial` in the subtree and only a *change* of
     * `animate` animates anything — see the hook's header. Without it the words are simply up
     * on the first frame when somebody lands here by refresh or by a link. */
    const entered = useEntered()

    const year = useSyncExternalStore(emptySubscribe, currentYear, buildYear)

    return (
        <>
            <BackHeader title="About" back={ROUTES.SETTINGS} bleed />

            {/* Sized to the room the shell leaves rather than to a fraction of the viewport, so
                the fine print lands on the floor of the page and the mark centres in what is
                left. The subtractions are that chrome: the safe-area inset and the mobile rail
                the scroll container is already inset by, plus this page's own header and foot.
                A page that merely got close would either scroll or leave a band of nothing. */}
            <section className="mx-auto flex min-h-[calc(100dvh-var(--safe-top)-var(--bottombar)-8.25rem)] w-full max-w-[470px] flex-col items-center justify-between gap-16 text-center md:min-h-[calc(100dvh-8.5rem)]">
                <div className="flex flex-1 items-center justify-center">
                    {/* The mark itself, on the page rather than on a field: the launcher's
                        black tile belongs to a home screen full of other icons, and here it
                        would be the one opaque rectangle on a surface that is otherwise all
                        air. Sized off the viewport like the gateway's, so it stays the subject
                        of the page on a phone and does not become a poster on a desktop.
                        Tapping cycles the palette, exactly as the mark on the way in does. */}
                    <GlossyMark
                        from={from}
                        to={to}
                        onClick={advance}
                        className="w-[min(33vw,10rem)]"
                    />
                </div>

                {/* The mark lands, then the words follow it in, on the same stagger the
                    sign-in screens use. `h-auto` because <Transition/> fills its box by
                    default, and a full-height foot would push the mark off centre. */}
                <Transition
                    delay={MARK_ENTRANCE_DELAY}
                    animate={{ opacity: entered ? 1 : 0.01 }}
                    className="flex h-auto w-full flex-col items-center gap-6 font-light text-muted-foreground/50"
                >
                    <div>
                        <p className="text-base">Version {APP_VERSION}</p>
                        <p className="text-sm">Build {APP_BUILD}</p>
                    </div>

                    <p className="text-sm leading-relaxed">
                        Made by <Out to={MAKER} /> in coordination <br/> with <Out to={PARISH} />
                    </p>

                    <p className="text-sm">
                        Copyright {year} {MAKER.name}, LLC
                        <br />
                        All rights reserved
                    </p>
                </Transition>
            </section>
        </>
    )
}

export default SettingsAboutPage
