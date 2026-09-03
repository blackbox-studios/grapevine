import { PrivacyPolicy, PRIVACY_TITLE } from "@/components/Legal"
import { APP_NAME } from "@/lib/constants"

/* The URL Google Play stores under App content → Privacy policy, and re-fetches periodically.
 * The text is `<PrivacyPolicy/>`, shared with the modal the login screen opens. */
export const metadata = {
    title: `${PRIVACY_TITLE} · ${APP_NAME}`,
    description: `How ${APP_NAME} handles your information.`,
}

const PrivacyPage = () => (
    <>
        <h1 className="mb-6 text-2xl font-semibold text-foreground">{PRIVACY_TITLE}</h1>
        <PrivacyPolicy />
    </>
)

export default PrivacyPage
