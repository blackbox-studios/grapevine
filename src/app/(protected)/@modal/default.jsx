/* No modal for the current URL — the `@modal` slot renders nothing. Required so
 * the parallel slot has a fallback on hard navigation (and whenever the route
 * isn't an intercepted post). */
const Default = () => null

export default Default
