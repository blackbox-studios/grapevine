/* Catch-all inside the protected shell so unknown routes render the 404 with the
 * full nav/breadcrumb chrome, matching the old `path: '*'` behaviour. */

/* A catch-all matches infinitely many paths, so there is nothing to enumerate for the
 * static native build — an empty list means "prerender none of them", which is what lets
 * `output: "export"` accept the segment at all. The route still works normally in the
 * Node build (npm run build), where the server matches it at request time.
 *
 * In the native app the 404 is therefore unreachable, and harmlessly so: there is no
 * address bar to mistype into, and Capacitor answers any path it has no file for with
 * index.html (see native-architecture.md → "Why there is no 404 in the app"), so a bad
 * link lands on the feed rather than a blank screen. */
export const generateStaticParams = () => [{ "not-found": ["not-found"] }]

const NotFoundPage = () => {
    return (
        <div className="flex w-full pt-[33vh]">
            <div className="flex items-center mx-auto select-none ">
                <h1 className="text-2xl leading-12 mr-5 pr-6 border-r border-foreground/30">404</h1>
                <div>
                    <h2>Page not yet implemented</h2>
                </div>
            </div>
        </div>
    )
}

export default NotFoundPage
