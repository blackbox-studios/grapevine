import "server-only"

import { APP_NAME, APP_STORES, OTP_LENGTH, SUPPORT_EMAIL } from "@/lib/constants"
import { sendEmail } from "@/lib/server/email"

/* The one letter Grapevine sends: "you have been added to a parish, here is how to get in".
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
 * look like they came from the same app. */

/* The mark, hosted in Supabase Storage rather than on our own domain, so a deploy cannot
 * 404 it. Regenerate with `node scripts/generate-email-logo.mjs`. */
const LOGO_URL =
    "https://svyqhmbtdiqgtdttwgem.supabase.co/storage/v1/object/public/media/brand/email-mark.png"

/* A parish's name and a priest's display name are typed by people and land inside markup, so
 * they are escaped rather than trusted. Nothing else interpolated below is user input: the
 * address is validated against `EMAIL_PATTERN` before admission and every URL is ours. */
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

const html = ({ to, group: rawGroup, by: rawBy }) => {
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

/* Sends the invitation, and never makes the caller wait for it.
 *
 * Detached for the reason every push is: it follows a committed admission, and a mail provider
 * having a bad minute must not turn a roster of thirty into a 500. `sendEmail` swallows its own
 * failures, so there is nothing here to catch. */
export const emailWelcome = ({ to, group, by }) => {
    sendEmail({
        to,
        subject: `${by} added you to ${group} on ${APP_NAME}`,
        text: plain({ to, group, by }),
        html: html({ to, group, by }),
    })
}
