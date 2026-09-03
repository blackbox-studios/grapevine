import Grain from "@/components/Grain"

/* The legal documents, and the only route group in the app behind **no gate at all**.
 *
 * That is the whole reason it exists as a sibling of `(public)`. `<PublicGate/>` redirects a
 * signed-in visitor to the feed, which is right for `/login` and wrong here: a Play reviewer
 * reads these signed out, Google's crawler re-fetches the privacy URL on its own schedule, and
 * a member following the link from Settings must land on the document rather than be bounced
 * home. A page that can redirect is a page that can fail a policy check.
 *
 * No app shell either — no nav, no group switcher. Nothing on these pages is scoped to a
 * viewer, and a reader arriving from the Play listing has no session to draw one from. */
const LegalLayout = ({ children }) => (
    <>
        <Grain />
        <main className="mx-auto w-full max-w-2xl px-6 py-12 pb-24">{children}</main>
    </>
)

export default LegalLayout
