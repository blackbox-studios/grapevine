import { SlidePage } from "@/components/SlideRouter"

/* Catch-all inside the protected shell. It serves two jobs, both keyed off the pathname
 * rather than a route segment:
 *
 *  - A cold load of a registered slide route (`/p/:id` opened from a shared link, a
 *    refresh, or a hard nav) renders that route's surface as a full-viewport page.
 *    <SlidePage/> resolves it off the RUNTIME_ROUTES registry.
 *  - Anything else is an unknown route, and renders the 404 with the full shell chrome
 *    (matching the old `path: '*'` behaviour).
 *
 * Runtime routes deliberately have *no page file of their own*. That is what keeps post ids
 * out of the build: a `/p/[postId]` segment would force `generateStaticParams` under
 * `output: "export"`, so every openable id would have to be enumerated ahead of time.
 * Resolving the path here instead means ids are only ever known at runtime, which is what
 * lets the feed be genuinely live/paginated.
 *
 * Note this file only handles the *slide* half. An ordinary (`slide: false`) runtime route is
 * substituted into the page slot by <RuntimeRoute/> in the shell's layout, which runs above
 * this — so a cold load of one renders the surface and never reaches the fallback below.
 * None is registered today; the path is wired and waiting. Interception (`@modal/(.)p/[postId]`) is not
 * an option either — the export rejects it outright ("Intercepting routes are not
 * supported with static export"). See native-architecture.md.
 *
 * A catch-all matches infinitely many paths, so there is nothing to enumerate here
 * either — the single sentinel below is the minimum `output: "export"` accepts for the
 * segment to exist at all (an empty list is rejected). The route still matches normally
 * in the Node build (npm run build), where the server resolves it at request time, so web
 * deep links into any post keep working.
 *
 * In the native app both paths are unreachable, and harmlessly so: the boot guard rewrites
 * any non-root URL to `/` before hydration, and Capacitor answers a path it has no file
 * for with index.html anyway (see native-architecture.md). */
export const generateStaticParams = () => [{ "not-found": ["not-found"] }]

const NotFoundPage = () => (
    <SlidePage
        fallback={
            <div className="flex w-full pt-[33vh]">
                <div className="flex items-center mx-auto select-none ">
                    <h1 className="text-2xl leading-12 mr-5 pr-6 border-r border-foreground/30">404</h1>
                    <div>
                        <h2>Page not yet implemented</h2>
                    </div>
                </div>
            </div>
        }
    />
)

export default NotFoundPage
