import "server-only"

import { APP_NAME, APP_STORES, OTP_LENGTH, SUPPORT_EMAIL } from "@/lib/constants"
import { prisma } from "@/lib/db"
import { displayName } from "@/lib/name"
import { sendEmail } from "@/lib/server/email"

/* The one letter Grapevine sends: "you have been added to a parish, here is how to get in",
 * and the queue that gets it there.
 *
 * It exists because of the invite-only gate. `signInWithOtp({ shouldCreateUser: false })`
 * means an address with no account can never be sent a code, so somebody an admin has just
 * admitted has a working account, no idea it exists, and no way to find out from inside an app
 * they have not installed. Everything the letter carries follows from that: where to get the
 * app, and that the address it arrived at is the one to sign in with.
 *
 * **It carries no link that signs anybody in.** There is no token to redeem and no accept
 * route (see `admitOne`), and a magic link would dead-end in the native WebView, which has no
 * origin to redirect back to. The reader signs in the ordinary way, with a code emailed to the
 * address this letter reached them at.
 *
 * Written as email HTML rather than as a React component: tables, inline styles, and a dark
 * mode carried by a `<style>` block that every client is free to ignore. It is the same
 * markup and the same palette as `supabase/templates/magic-link.html`, which is the sign-in
 * code's template, so the two pieces of mail a new parishioner receives in their first minute
 * look like they came from the same app.
 *
 * ── Sending is a queue, not something the request does ───────────────────────
 *
 * Admission writes the `Invite` row owing a letter and returns. `sendOwedInvites` picks it up
 * afterwards, and `sweepOwedInvites` is what calls that on a deploy with no schedule — the
 * same shape, and for the same reason, as `sendDueReminders` and `sweepDueReminders` in
 * signups.service.js.
 *
 * Sending inside the request is the obvious shape, and it fails in two ways that both end with
 * somebody admitted and never told, which is the one outcome this letter exists to prevent:
 *
 *  - **A provider refusal has nowhere to go.** A daily quota reached halfway through a roster
 *    of a hundred loses the rest of the letters outright, and nothing in the response says so:
 *    `{ admitted, failed }` reports admission, not delivery, so the priest reads "100 added, 0
 *    failed" while forty people hear nothing.
 *  - **The instance may not live long enough.** Production is serverless, and a hundred
 *    addresses at the queue's own pace is around a minute of work *after* the response has
 *    gone. Nothing here calls `waitUntil`, so an unknown fraction of it is simply dropped.
 *
 * Both become "try again shortly" once the row is the queue. */

/* The mark, hosted in Supabase Storage rather than on our own domain, so a deploy cannot 404
 * it, and a raster because Gmail strips `<svg>` and blocks `data:` URIs in `src`.
 *
 * **The same object the sign-in template points at**, and neither reads it from a constant, so
 * a rebrand has to run `node scripts/generate-email-logo.mjs` or these two emails keep serving
 * the old mark after every other copy has moved. It is surface 9 in `brand-assets.md`. */
const LOGO_URL =
    "https://svyqhmbtdiqgtdttwgem.supabase.co/storage/v1/object/public/media/brand/email-mark.png"

/* Everything a person typed lands inside markup, so all of it is escaped rather than trusted:
 * a parish's name, a priest's display name, and the address itself. The address is the one
 * that looks like it needs no escaping and does: `EMAIL_PATTERN` forbids whitespace and a
 * second `@` and nothing else, so `<img src=x onerror=...>@evil.com` is a well formed address
 * as far as admission is concerned. Every URL interpolated below is ours. */
const escape = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")

/* Where the app is served, for the "open it in a browser" link. The server's own base URL
 * rather than a constant, so a staging deploy invites people to itself. */
const webUrl = () => (process.env.APP_BASE_URL || "https://throughgrapevine.com").replace(/\/$/, "")

/* Every way to get the app, in the order somebody is likely to want them, and only the ones
 * that exist. A store the app has not shipped to yet is absent from the list rather than
 * present and broken. */
const links = () =>
    [
        { label: `Open ${APP_NAME} in your browser`, href: webUrl() },
        { label: "Get it on Google Play", href: APP_STORES.android },
        { label: "Download on the App Store", href: APP_STORES.ios },
    ].filter((link) => Boolean(link.href))

/* The instructions, written once and rendered twice: numbered rows in the HTML, a numbered
 * list in the plain text. The address is printed rather than described, because "the address
 * this reached you at" is a sentence somebody has to go and check. */
const steps = (to) => [
    `Install ${APP_NAME}, or open it in your browser.`,
    `Sign in with this email address: ${to}`,
    `We will email you a ${OTP_LENGTH} digit code. Type it in. There is no password to remember.`,
]

const plain = ({ to, group, by }) =>
    [
        `${by} added you to ${group} on ${APP_NAME}.`,
        "",
        `${APP_NAME} is where the parish keeps its announcements, photos, calendar and sign-up sheets.`,
        "",
        "How to sign in:",
        ...steps(to).map((step, index) => `${index + 1}. ${step}`),
        "",
        ...links().map((link) => `${link.label}: ${link.href}`),
        "",
        `You are receiving this because an admin of ${group} added you. If you were not expecting it, you can ignore this email, or write to ${SUPPORT_EMAIL}.`,
    ].join("\n")

/* One of the download rows. A bordered pill rather than a filled button for the two stores, so
 * the browser link reads as the primary one: it is the only destination that works on whatever
 * the reader is holding right now. */
const linkRow = (link, primary) => `
                <tr>
                  <td class="gv-pad" style="padding:0 40px 12px 40px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="${primary ? "gv-cta" : "gv-cta-soft"}" align="center"
                            style="${
                                primary
                                    ? "background-color:#16806B; border:1px solid #16806B;"
                                    : "background-color:#ffffff; border:1px solid #d5e4e0;"
                            } border-radius:10px;">
                          <a href="${link.href}"
                             style="display:block; padding:14px 20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; font-weight:600; line-height:1.2; text-decoration:none; color:${primary ? "#ffffff" : "#16806B"};">${link.label}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`

const stepRow = (step, index) => `
                <tr>
                  <td class="gv-pad" style="padding:0 40px 10px 40px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="26" valign="top"
                            style="width:26px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; font-weight:600; color:#16806B;">${index + 1}.</td>
                        <td class="gv-text" valign="top"
                            style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#5a6b74;">${step}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`

const html = ({ to: rawTo, group: rawGroup, by: rawBy }) => {
    const to = escape(rawTo)
    const group = escape(rawGroup)
    const by = escape(rawBy)

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>You have been added to ${group}</title>
<style>
  /* Dark mode. \`[data-ogsc]\` is Outlook.com's hook, which rewrites the DOM instead of
     honouring the media query, so both selectors carry every rule. */
  @media (prefers-color-scheme: dark) {
    .gv-bg       { background-color: #0a1014 !important; }
    .gv-card     { background-color: #131b21 !important; border-color: #24313a !important; }
    .gv-title    { color: #f2f6f8 !important; }
    .gv-text     { color: #a9b8c2 !important; }
    .gv-muted    { color: #7d8f9b !important; }
    .gv-cta-soft { background-color: #0a1014 !important; border-color: #2f4a44 !important; }
    .gv-rule     { border-color: #24313a !important; }
  }
  [data-ogsc] .gv-bg       { background-color: #0a1014 !important; }
  [data-ogsc] .gv-card     { background-color: #131b21 !important; border-color: #24313a !important; }
  [data-ogsc] .gv-title    { color: #f2f6f8 !important; }
  [data-ogsc] .gv-text     { color: #a9b8c2 !important; }
  [data-ogsc] .gv-muted    { color: #7d8f9b !important; }
  [data-ogsc] .gv-cta-soft { background-color: #0a1014 !important; border-color: #2f4a44 !important; }
  [data-ogsc] .gv-rule     { border-color: #24313a !important; }

  @media only screen and (max-width: 480px) {
    .gv-pad { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>

<body class="gv-bg" style="margin:0; padding:0; width:100%; background-color:#f1f4f3;">

  <!-- Preview text: what the inbox list shows beside the subject. The spacer stops the
       client from padding it out with the first words of the body. -->
  <div style="display:none; font-size:1px; color:#f1f4f3; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
    Sign in with this email address. There is no password.
    &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <table role="presentation" class="gv-bg" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#f1f4f3;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:480px; width:100%;">

          <tr>
            <td align="center" style="padding:0 0 28px 0;">
              <img src="${LOGO_URL}" width="64" height="64" alt="${APP_NAME}"
                   style="display:block; width:64px; height:64px; border:0; outline:none; text-decoration:none;">
            </td>
          </tr>

          <tr>
            <td class="gv-card"
                style="background-color:#ffffff; border:1px solid #e3e9e7; border-radius:18px;">

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="gv-pad" style="padding:40px 40px 8px 40px;">
                    <h1 class="gv-title"
                        style="margin:0 0 12px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:22px; line-height:1.3; font-weight:600; color:#111b21; letter-spacing:-0.01em;">
                      You have been added to ${group}
                    </h1>
                    <p class="gv-text"
                       style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#5a6b74;">
                      ${by} added you on ${APP_NAME}, where the parish keeps its announcements,
                      photos, calendar and sign-up sheets.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td class="gv-pad" style="padding:28px 40px 12px 40px;">
                    <p class="gv-title"
                       style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.4; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:#111b21;">
                      How to sign in
                    </p>
                  </td>
                </tr>
${steps(to).map(stepRow).join("")}

                <tr>
                  <td style="padding:20px 0 0 0;"></td>
                </tr>
${links()
    .map((link, index) => linkRow(link, index === 0))
    .join("")}

                <tr>
                  <td class="gv-pad" style="padding:16px 40px 32px 40px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="gv-rule" style="border-top:1px solid #e3e9e7; font-size:0; line-height:0; height:1px;">&nbsp;</td>
                      </tr>
                    </table>
                    <p class="gv-muted"
                       style="margin:20px 0 0 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.6; color:#8496a0;">
                      You are receiving this because an admin of ${group} added you. If you were
                      not expecting it, you can ignore this email, or write to
                      <a href="mailto:${SUPPORT_EMAIL}" style="color:#16806B; text-decoration:none;">${SUPPORT_EMAIL}</a>.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 16px 0 16px;">
              <p class="gv-muted"
                 style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:1.6; color:#94a5ae;">
                ${APP_NAME} &middot; throughgrapevine.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/* Sends one invitation and resolves with whether it went. */
const emailWelcome = ({ to, group, by }) =>
    sendEmail({
        to,
        subject: `${by} added you to ${group} on ${APP_NAME}`,
        text: plain({ to, group, by }),
        html: html({ to, group, by }),
    })

/* ---------------------------------------------------------------------------
 * The queue
 * ------------------------------------------------------------------------- */

/* How many letters one run will send. A ceiling rather than a page: a run that finds more than
 * this has a backlog, and the next sweep a few minutes later takes the rest. It is small
 * because the queue below paces itself at roughly two a second, and a run that would take a
 * minute is a run a serverless instance may not survive — twenty is a few seconds of work,
 * which is the point of a bounded batch here rather than a large one. */
const INVITE_BATCH = 20

/* How often a lazy sweep will actually do anything, per process. Nobody is waiting on a
 * letter, so this is deliberately slower than the reminders' sweep: a minute or two late is
 * indistinguishable from immediate to somebody who has not been told yet. */
const INVITE_SWEEP_MS = 2 * 60 * 1000

/* The backoff, as the wait before attempt N+1. Doubling from two minutes and flattening at
 * three hours, so the first couple of retries clear an ordinary blip in minutes while the
 * later ones stretch far enough to walk a daily quota round to its reset. */
const INVITE_BACKOFF_MS = [2, 4, 8, 16, 32, 64, 128, 180].map((m) => m * 60 * 1000)

/* How many sends are tried before the letter is abandoned. Ten spans well over a day under the
 * backoff above, which is what makes "the provider refused everything until midnight" a
 * recoverable state rather than a lost one. Past it the row stays unsent and un-retried, which
 * is the honest end state for an address that cannot be delivered to at all: a typo in a
 * roster is not fixed by trying it a thousand more times. */
const INVITE_MAX_ATTEMPTS = 10

const backoffFrom = (attempts) =>
    INVITE_BACKOFF_MS[Math.min(attempts, INVITE_BACKOFF_MS.length - 1)]

/* What the letter is written from: the group it names and the person who signed it. */
const owedInclude = {
    org: { select: { name: true } },
    invitedBy: {
        select: { displayName: true, firstName: true, lastName: true, handle: true },
    },
}

/* Sends every letter that is owed and due, and records only the ones that went.
 *
 * ── Claimed before it is used ────────────────────────────────────────────────
 *
 * Two sweeps can run at once — several instances, a hand-run script, a retry — so each row is
 * claimed by pushing `nextAttemptAt` forward *before* the send, conditionally on it still being
 * due. The loser's update matches nothing and it sends nothing, rather than both of them
 * mailing the same person twice.
 *
 * One `updateMany` per row rather than one for the batch, because the new wait depends on that
 * row's own attempt count. They go in a single `$transaction([...])`, so it is still one round
 * trip.
 *
 * ── The claim is also the backoff ────────────────────────────────────────────
 *
 * The value written is the wait for the attempt about to happen, which means a send that
 * *fails* needs no write at all: the row is already scheduled for its next try. Only success is
 * recorded afterwards. This is the opposite direction from `sendDueReminders`, which stamps
 * `sentAt` up front and so loses a nudge on a crash rather than repeating it — right for a
 * reminder, wrong here, because a lost letter is somebody who never learns the account exists
 * while a duplicate is one redundant email. */
export const sendOwedInvites = async ({ now = new Date() } = {}) => {
    const due = await prisma.invite.findMany({
        where: {
            sentAt: null,
            nextAttemptAt: { lte: now },
            attempts: { lt: INVITE_MAX_ATTEMPTS },
        },
        orderBy: { nextAttemptAt: "asc" },
        take: INVITE_BATCH,
        include: owedInclude,
        relationLoadStrategy: "join",
    })

    if (due.length === 0) return { sent: 0, owed: 0 }

    const claimed = await prisma.$transaction(
        due.map((invite) =>
            prisma.invite.updateMany({
                where: { id: invite.id, sentAt: null, nextAttemptAt: { lte: now } },
                data: {
                    attempts: { increment: 1 },
                    nextAttemptAt: new Date(now.getTime() + backoffFrom(invite.attempts)),
                },
            }),
        ),
    )

    const mine = due.filter((_, index) => claimed[index].count === 1)
    if (mine.length === 0) return { sent: 0, owed: 0 }

    /* Who these addresses now belong to, asked once for the batch rather than joined per row:
     * an `Invite` carries an address, and the two things that would make sending wrong are
     * facts about the person behind it. */
    const people = await prisma.profile.findMany({
        where: { email: { in: mine.map((invite) => invite.email) } },
        select: {
            email: true,
            lastSeenAt: true,
            memberships: { select: { orgId: true, status: true } },
        },
        relationLoadStrategy: "join",
    })
    const byEmail = new Map(people.map((person) => [person.email, person]))

    const sent = []
    const stale = []

    for (const invite of mine) {
        const person = byEmail.get(invite.email)
        const approved = person?.memberships.some(
            (membership) => membership.orgId === invite.orgId && membership.status === "APPROVED",
        )

        /* Nothing to say any more. They signed in on their own before the letter went, so it
         * would arrive explaining something they have already done; or their access was
         * revoked between the admission and now, and welcoming somebody to a group they are no
         * longer in is worse than silence. Retired rather than sent, so neither is re-read
         * by every run forever. */
        if (!person || person.lastSeenAt || !approved) {
            stale.push(invite.id)
            continue
        }

        const went = await emailWelcome({
            to: invite.email,
            group: invite.org.name,
            by: displayName(invite.invitedBy),
        })

        /* A refusal needs no write: the claim above already scheduled the next attempt. */
        if (went) sent.push(invite.id)
    }

    /* `nextAttemptAt` back to null alongside it, so the column keeps meaning exactly one thing:
     * non-null is a letter still owed. Leaving the claim's backoff on a row that has been
     * delivered would make it read as owed again at a date that has already passed. */
    if (sent.length > 0 || stale.length > 0) {
        await prisma.invite.updateMany({
            where: { id: { in: [...sent, ...stale] } },
            data: { sentAt: now, nextAttemptAt: null },
        })
    }

    return { sent: sent.length, owed: mine.length - sent.length - stale.length }
}

let lastSweep = 0

/* Sends whatever is owed, at most once every `INVITE_SWEEP_MS`, without blocking the caller.
 *
 * Hung off `GET /api/notifications/unread` for the reason `sweepDueReminders` is: it is the
 * request every client makes on boot, on every foreground, and on a thirty-second poll where
 * push cannot reach, which is the closest thing this app has to a clock and one it already
 * pays for. The alternative is a cron nobody has set up, and a letter that goes out only once
 * somebody happens to open the roster.
 *
 * The throttle is per process, so several instances sweep independently. That is harmless:
 * `sendOwedInvites` claims each row before it uses it, and two sweeps racing cannot mail
 * anybody twice.
 *
 * **Never awaited, and it swallows everything.** The bell's tally must not get slower, or
 * fail, because a letter could not be delivered. */
export const sweepOwedInvites = () => {
    const now = Date.now()
    if (now - lastSweep < INVITE_SWEEP_MS) return

    /* Stamped before the work rather than after it, so a slow sweep does not let the next
     * request start a second one alongside it. */
    lastSweep = now

    sendOwedInvites().catch((error) => {
        console.error("[invites] sweep failed", error)
    })
}
