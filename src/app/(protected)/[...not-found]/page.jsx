/* Catch-all inside the protected shell so unknown routes render the 404 with the
 * full nav/breadcrumb chrome, matching the old `path: '*'` behaviour. */
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
