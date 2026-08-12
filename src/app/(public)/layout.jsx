import Grain from "@/components/Grain";
import PageTransition from "@/components/PageTransition";
import { PublicGate } from "@/components/AuthGate";

/* Auth redirects are handled by <PublicGate/> (see components/AuthGate.jsx for the
 * /login gate). */
const PublicLayout = ({ children }) => {
    return (
        <PublicGate>
            <Grain />
            <PageTransition>{children}</PageTransition>
        </PublicGate>
    )
}

export default PublicLayout
