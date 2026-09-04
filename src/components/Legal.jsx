"use client"

import Hyperlink from "@/components/Hyperlink"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/constants"
import { useIsDesktop } from "@/lib/hooks/useIsDesktop.hook"

/* The two documents the app is obliged to publish, as content rather than as pages.
 *
 * **Written once and rendered twice.** The login screen opens them as modals, which is how
 * anyone actually reads them, and `(legal)/privacy` and `(legal)/delete-account` render the
 * same components at real URLs, because Google Play stores a *URL* for each and re-fetches it.
 * A screen inside the app cannot stand in for that however complete its text is. Two copies of
 * a legal document that must agree with a signed Data safety declaration is the kind of drift
 * that is only discovered by an enforcement email, so there is one copy and it lives here.
 *
 * The modal is also the only one of the two a *native* reader can reach: the boot script in
 * `app/layout.jsx` rewrites any non-root path to "/" on a cold start, so a packaged build has
 * no `/privacy` to deep-link to.
 *
 * ── Keeping it true ─────────────────────────────────────────────────────────
 *
 * The data inventory below is the schema, not a template. Every item traces to a column in
 * `prisma/schema.prisma` or to a processor the app actually calls, and Play's Data safety form
 * is answered from the same list (see `RELEASING.md`). **Adding a column that holds something
 * about a person means editing this file in the same change** — a policy that under-declares is
 * a policy violation rather than an oversight.
 *
 * ── No em dashes in the strings below ───────────────────────────────────────
 *
 * A house rule for everything a reader sees, and this file is the densest concentration of
 * reader-facing prose in the app. See the copy rule in CLAUDE.md. It governs the strings, not
 * comments like this one.
 */

const UPDATED = "3 September 2026"

const Mail = () => <Hyperlink soft href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</Hyperlink>

/* Shared type scale for both documents, so the modal and the page read identically. */
const H = ({ children }) => (
    <h2 className="mt-6 mb-2 text-sm font-semibold text-foreground first:mt-0">{children}</h2>
)
const P = ({ children }) => (
    <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{children}</p>
)
const List = ({ children }) => (
    <ul className="mb-3 flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-muted-foreground">
        {children}
    </ul>
)

export const PRIVACY_TITLE = "Privacy Policy"

export const PrivacyPolicy = () => (
    <div>
        <P>Last updated {UPDATED}.</P>

        <P>
            {APP_NAME} is a private communications app for Orthodox parishes and dioceses,
            operated by Blackbox Studios. It is invite&#8209;only. An administrator of a group
            creates your account, and you cannot sign yourself up. This policy describes what we
            hold about you, why we hold it, and how to have it removed.
        </P>

        <H>What we collect</H>
        <P>Everything below is given to us by you or by the administrator who added you.</P>
        <List>
            <li>
                <strong>Your account.</strong> Your email address, which is also how you sign in,
                and the @handle you choose.
            </li>
            <li>
                <strong>Your profile.</strong> First and last name, patron saint, vocation,
                profile picture, name day, ordination date, and date of birth.
            </li>
            <li>
                <strong>What you write.</strong> Posts, comments, photos you upload, and the posts
                and comments you like.
            </li>
            <li>
                <strong>Who you are connected to.</strong> The groups you belong to and your role
                in each, the people you follow, and any direct messages you send.
            </li>
            <li>
                <strong>Technical.</strong> A push notification token for each device you enable
                notifications on, and the time you last used the app.
            </li>
        </List>
        <P>
            We do not collect your location, your contacts, your payment details, or anything from
            other apps. {APP_NAME} contains no advertising and no third&#8209;party analytics or
            tracking software.
        </P>

        <H>What is visible to others, and what is not</H>
        <P>
            {APP_NAME} has no public content. What you write is readable only by people who hold
            an approved membership in the same group. There is no feed, page or search that
            reaches outside your groups.
        </P>
        <P>
            <strong>Your date of birth and your email address are never shown to anyone.</strong>{" "}
            They are collected so your parish can remember your birthday and so you can sign in,
            and the app does not publish either.
        </P>

        <H>Why we hold it</H>
        <List>
            <li>To sign you in and keep you signed in.</li>
            <li>To show your name and picture beside what you write.</li>
            <li>To deliver notifications you have asked for.</li>
            <li>To let administrators manage who belongs to their group.</li>
        </List>
        <P>
            We do not sell your information, share it for advertising, or use it to build a profile
            of you.
        </P>

        <H>Who else processes it</H>
        <P>
            We use a small number of service providers, each acting on our instructions and only to
            run the app.
        </P>
        <List>
            <li>
                <strong>Supabase.</strong> Database, sign&#8209;in, and file storage.
            </li>
            <li>
                <strong>Vercel.</strong> Application hosting.
            </li>
            <li>
                <strong>Resend.</strong> Delivers the sign&#8209;in code emails.
            </li>
            <li>
                <strong>Google Firebase Cloud Messaging.</strong> Delivers push notifications to
                your device.
            </li>
        </List>

        <H>How long we keep it</H>
        <P>
            For as long as your account exists. If an administrator removes you from a group you
            lose access to it immediately, and if your account is deleted everything listed above
            is destroyed. See <strong>Deleting your account</strong> below.
        </P>

        <H>Security</H>
        <P>
            Traffic is encrypted in transit. The database enforces row&#8209;level security, and
            every request is authorised individually against your current memberships, so removing
            someone takes effect on their very next request rather than whenever their session
            happens to expire.
        </P>

        <H>Children</H>
        <P>
            {APP_NAME} is not directed to children under 13 and we do not knowingly create accounts
            for them. Because every account is created by a group administrator rather than by
            self&#8209;signup, admission is always a decision made by an adult. If you believe a
            child&apos;s information is held here, write to <Mail /> and we will remove it.
        </P>

        <H>Your rights</H>
        <List>
            <li>
                <strong>See and correct</strong> what we hold. Most of it is editable directly in
                the app under Settings.
            </li>
            <li>
                <strong>Have it erased.</strong> See below.
            </li>
            <li>
                <strong>Ask a question or complain.</strong> Write to <Mail />.
            </li>
        </List>
        <P>
            Depending on where you live you may also have the right to a copy of your data, to
            object to how it is handled, or to complain to a supervisory authority. Write to us and
            we will help.
        </P>

        <H>Deleting your account</H>
        <P>
            Write to <Mail /> from the address on your account. We remove your profile, posts,
            comments, likes, photos, memberships, follows, messages and device tokens, along with
            the sign&#8209;in credential itself. This cannot be undone, and because {APP_NAME} is
            invite&#8209;only you would need an administrator to add you again.
        </P>

        <H>Changes</H>
        <P>
            If this policy changes materially we will update the date at the top, and where the
            change affects how your information is used we will tell you in the app.
        </P>

        <H>Contact</H>
        <P>
            Blackbox Studios, <Mail />
        </P>
    </div>
)

export const DELETION_TITLE = "Delete your account"

/* The same document, named for where it is read. The standalone page is the one Play stores and
 * that a person goes looking for, so it says plainly what it is. The login screen is not the
 * place to open with "how to leave": the link is there so the instructions are one tap from the
 * door, not to advertise the exit, so it wears the neutral name and the deletion heading appears
 * once the reader is already inside. */
export const DELETION_TITLE_SOFT = "Your data"

export const AccountDeletion = () => (
    <div>
        <P>Last updated {UPDATED}.</P>

        <P>
            This page explains how to have your {APP_NAME} account, and the data held with it,
            permanently deleted. {APP_NAME} is operated by Blackbox Studios.
        </P>

        <P>
            There is no delete button inside the app, because accounts here are created by a
            group administrator rather than by signing yourself up, so deletion is a request
            rather than a self&#8209;service action.
        </P>

        <H>How to request deletion</H>
        <List>
            <li>
                Email <Mail /> <strong>from the email address on your {APP_NAME} account</strong>.
            </li>
            <li>Say that you want your account and data deleted.</li>
            <li>
                We reply to confirm, and complete the deletion within 30 days. It is usually done
                within a few days.
            </li>
        </List>
        <P>
            Sending from the address on your account is how we confirm the request is yours. If
            you no longer have access to it, write anyway and we will find another way to verify
            you.
        </P>

        <H>What is deleted</H>
        <List>
            <li>
                Your profile: name, patron saint, @handle, profile picture, vocation, date of
                birth, name day and ordination date.
            </li>
            <li>Your email address and the sign&#8209;in credential attached to it.</li>
            <li>Everything you have written: posts, comments and uploaded photos.</li>
            <li>Your likes, your follows, and your direct messages.</li>
            <li>Your group memberships.</li>
            <li>Your push notification tokens.</li>
        </List>

        <H>What is kept, and for how long</H>
        <P>
            Once we action your request the data above is removed from the live app immediately.
        </P>
        <P>
            Residual copies may remain in our encrypted database backups for up to{" "}
            <strong>30 days</strong>, after which they are overwritten and cannot be recovered.
            Backups are not readable from the app and are used only to restore service after a
            failure.
        </P>
        <P>
            We keep nothing else, except where the law requires it, such as a minimal record that
            a deletion request was made and actioned.
        </P>

        <H>This cannot be undone</H>
        <P>
            Deletion is permanent. Because {APP_NAME} is invite&#8209;only, returning later means
            a group administrator adding you again from scratch, and nothing you previously wrote
            comes back.
        </P>

        <H>If you only want to leave one group</H>
        <P>
            You do not need to delete your account. Ask an administrator of that group to remove
            you and you will lose access to it immediately while keeping the rest of your account.
        </P>
    </div>
)

/* ---------------------------------------------------------------------------
 * Reading them inside the app
 * ------------------------------------------------------------------------- */

/* One document, presented the way every other read-and-dismiss surface here is: a dialog on a
 * desktop, a bottom sheet on a phone.
 *
 * A modal rather than a route, on this screen specifically, because the login page is where the
 * link is and sending somebody away from a half-typed email address to read a policy is how you
 * lose them. It also works in the packaged app, which `/privacy` does not: the boot script
 * rewrites any non-root path to "/" on a cold start.
 *
 * `which` is null when nothing is open, so one piece of state drives both links. */
export const LegalModal = ({ which, onOpenChange }) => {
    const isDesktop = useIsDesktop()

    const open = Boolean(which)
    const title = which === "deletion" ? DELETION_TITLE_SOFT : PRIVACY_TITLE
    const body = which === "deletion" ? <AccountDeletion /> : <PrivacyPolicy />

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                {/* `DialogContent` is a grid whose rows are `auto`, so a tall child grows the
                    panel past its own max-height and the body never becomes scrollable. Naming
                    the rows, and giving the second `minmax(0,1fr)`, is what bounds it. `min-h-0`
                    on the child is the other half: a grid item's floor is its content unless told
                    otherwise, and `overflow-y-auto` on an unbounded box does nothing.

                    Deliberately **not** `overflow-hidden` on the panel: the close button is
                    positioned outside it (`-top-8 -right-8`), and clipping the panel removes it. */}
                <DialogContent className="max-h-[80vh] grid-rows-[auto_minmax(0,1fr)] gap-4 sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                    </DialogHeader>
                    <div className="-mr-3 min-h-0 overflow-y-auto pr-3">{body}</div>
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="max-h-[85vh]">
                <DrawerHeader className="pb-2 text-left">
                    <DrawerTitle>{title}</DrawerTitle>
                </DrawerHeader>
                {/* `min-h-0` for the flex-column equivalent of the grid problem above. */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">{body}</div>
            </DrawerContent>
        </Drawer>
    )
}
