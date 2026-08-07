import Grain from "@/components/Grain";
import PageTransition from "@/components/PageTransition";

/* Auth redirects are handled by middleware.js (see it for the /login gate). */
const PublicLayout = ({ children }) => {
    return (
        <>
            <Grain />
            <PageTransition>{children}</PageTransition>
        </>
    )
}

export default PublicLayout
