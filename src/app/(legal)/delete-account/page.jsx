import { AccountDeletion, DELETION_TITLE } from "@/components/Legal"
import { APP_NAME } from "@/lib/constants"

/* The URL Google Play stores as the account-deletion request link in the Data safety form.
 * It has to be readable by somebody who cannot sign in, which is why it says how to ask by
 * email rather than pointing at a control inside the app. */
export const metadata = {
    title: `${DELETION_TITLE} · ${APP_NAME}`,
    description: `How to have your ${APP_NAME} account and data permanently deleted.`,
}

const DeleteAccountPage = () => (
    <>
        <h1 className="mb-6 text-2xl font-semibold text-foreground">{DELETION_TITLE}</h1>
        <AccountDeletion />
    </>
)

export default DeleteAccountPage
