# Releasing

Store submission runbook. The build side is `npm run release:android`; everything here is the
console work around it that a script cannot do.

Play Console renames its menus regularly. Where a path below is wrong, the *thing* still
exists — search the console for the noun rather than the path.

---

## Where the account already stands

Blackbox Studios, **organization** account, ID `6507276289092695069`. Identity verified and
website ownership verified (2026-09-02). No app created yet.

Two consequences worth knowing before planning anything:

- **No D-U-N-S number is needed for Play.** That requirement applies to an unverified
  organization Payments profile; this one is verified. (Apple is a separate enrolment and is
  still waiting on it — see `TODO.md`.)
- **The 12-testers-for-14-days rule does not apply.** That gate is for *personal* accounts
  created after 2023-11-13. An organization account can go to production without it. Do not
  plan two weeks of closed testing you do not owe.

---

## 1. Create the app

**All apps → Create app.**

| Field | Value |
| --- | --- |
| App name | `Grapevine` (this is the store name, 30 chars; it does not have to match the launcher label) |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free — see the note below |
| Declarations | Not primarily child-directed; complies with US export laws |

The package name `com.throughgrapevine.app` is not chosen here — it is fixed at first upload
and is **permanent**. Verify the `.aab` before uploading, because there is no changing it.

> **Free vs paid.** Set Free. Grapevine's paid tier is a subscription an owner buys from you
> (`npm run owner` is the seam), not a Play purchase. If billing ever moves in-app, Play takes
> its cut and Google Play Billing becomes mandatory for it — a paid→free switch is allowed but
> free→paid is not, so Free is also the reversible choice.

---

## 2. App access — the one that will get you rejected

**Test and release → App access.**

This is the highest-risk item in the whole submission, and it is specific to how Grapevine
signs people in.

The app is invite-only: `signInWithOtp({ shouldCreateUser: false })` means an address with no
account **cannot** be sent a code. A Play reviewer therefore cannot sign up, cannot get in,
and will reject the app as broken. On top of that, the credential is a 6-digit code emailed at
sign-in time — so handing over "an email address" is not enough. The reviewer needs the
**inbox**.

Supabase has no fix for this. `auth.sms.test_otp` maps a phone number to a fixed code, but
there is no email equivalent — confirmed against the CLI config reference.

**Do this:**

1. **Provision the account.** It must exist before the reviewer arrives, and it must be
   ordinary — a MEMBER, never an ADMIN or a platform OWNER:

   ```bash
   npm run reviewer -- review@throughgrapevine.com --org holy-trinity-cathedral
   npm run reviewer                                    # show reviewer accounts and their access
   npm run reviewer -- review@throughgrapevine.com --revoke   # after review
   ```

   The script stamps `onboardedAt`, so the reviewer lands on the feed rather than on
   `/welcome` being asked for a Christian name. It warns if the group has no posts — an empty
   feed gets rejected as decisively as a broken one, so publish a few first.

2. **Set the fixed code**, so they need no inbox at all:

   ```bash
   # .env.production
   REVIEW_EMAIL=review@throughgrapevine.com
   REVIEW_OTP=<12+ chars — node -e "console.log(crypto.randomUUID())">
   ```

   `POST /api/auth/review` 404s unless both are set. It **never mints a session**: it returns
   Supabase's real current OTP for that one hardcoded address, and the ordinary `verifyOtp`
   flow performs the sign-in — so Supabase still authenticates, the code still expires on its
   schedule, and no address but that constant can be selected. Whoever holds `REVIEW_OTP` can
   sign in as one unprivileged demo account and nothing else.

3. In App access, choose **All or some functionality is restricted** and add one instruction
   set:

   > Grapevine is invite-only; accounts cannot be self-created.
   >
   > 1. Open the app and enter: `review@throughgrapevine.com`
   > 2. When asked for the 6-digit code, enter: `<REVIEW_OTP>`
   > 3. The account is a member of a demo parish with sample content.

**Unset both variables once review is done**, and run `--revoke`. The first closes the door;
the second takes the account's access away. They are separate on purpose — a resubmission
needs only `--org` again, not a re-provision.

> This is a deliberate, bounded exception to the rule in `dev-login.mjs`'s header that a route
> issuing a session for an arbitrary address is a backdoor by construction. The exception holds
> only because the address is a compile-time constant compared before anything happens, and
> because the route hands back a code rather than a session. Do not widen either property.

Also: the hourly email cap. Sending is limited to **30 messages/hour**; a reviewer retrying
alongside a parish's first sign-ins can hit it, and the failure (`429
over_email_send_rate_limit`) looks exactly like a broken app. Raise it under
**Authentication → Rate Limits** before submitting.

---

## 3. Privacy policy and deletion URLs — written, deployed with the next push

Both exist as ungated pages in the app, statically prerendered so the text is in the HTML
without JavaScript — which is what a crawler checking the URL actually reads:

| Play Console field | URL |
| --- | --- |
| App content → Privacy policy | `https://www.throughgrapevine.com/privacy` |
| Data safety → account deletion | `https://www.throughgrapevine.com/delete-account` |

The text lives once in `src/components/Legal.jsx` and is rendered twice: at those URLs, and as
the modals the login screen opens — which is the only presentation the packaged app can reach,
since the boot script rewrites any non-root path to `/` on a cold start.

`src/app/(legal)/` is the only route group behind **no gate**. `<PublicGate/>` redirects a
signed-in visitor to the feed, which would fail a policy check the moment a reviewer happened
to be signed in.

> **When the app moves to `app.throughgrapevine.com`**, these URLs move with it. Both Play
> fields can be edited at any time without resubmitting, so this is a console edit rather than
> a release — but either update them or leave a redirect from the apex, because Google
> re-fetches the privacy URL on its own schedule and a dead one is a policy violation.

**The inventory in that file is the schema, not boilerplate**, and Play cross-checks the policy
against the Data safety answers. Adding a column that holds something about a person means
editing `Legal.jsx` in the same change.

---

## 4. Data safety

**Policy → App content → Data safety.** This is a declaration you sign; getting it wrong is a
policy violation rather than a mistake. Grapevine's actual collection:

| Data type | Collected | Linked to user | Purpose | Optional? |
| --- | --- | --- | --- | --- |
| Email address | Yes | Yes | Account management | Required |
| Name | Yes | Yes | Account management, app functionality | Required |
| User IDs | Yes | Yes | Account management (`@handle`) | Required |
| Date of birth | Yes | Yes | App functionality | Optional |
| Photos | Yes | Yes | App functionality (avatars, post images) | Optional |
| Messages / other UGC | Yes | Yes | App functionality (posts, comments) | Optional |
| Device or other IDs | Yes | Yes | App functionality (push delivery) | Optional |
| Location | **No** | — | — | — |
| Financial info | **No** | — | — | — |
| Contacts | **No** | — | — | — |

Also answer:

- **Encrypted in transit** — Yes. (`release-target.mjs` refuses to build against a non-HTTPS
  API, so this is enforced rather than asserted.)
- **Third-party sharing** — Supabase (hosting/auth/storage), Google Firebase (push delivery),
  Resend (transactional email). These are processors, not sales of data.
- **Users can request data deletion** — Yes, on request rather than in-app.

  **The in-app account-deletion requirement does not apply here.** It is conditional on the
  user being able to *create* an account: *"If your app allows users to create an account from
  within your app... it must also allow users to request for their account to be deleted"*, and
  *"if your app doesn't have an option to create an account, this requirement does not apply."*
  Google counts creation as completing it in the app **or** being directed to a creation flow
  outside it. Grapevine does neither — `shouldCreateUser: false`, an admin provisions everyone.
  Apple's 5.1.1(v) is worded the same way.

  What answers the form — and GDPR Art. 17, which applies regardless of any store's policy — is
  `npm run erase -- <email>`. It reports what would go and changes nothing until `--confirm`,
  and it refuses two departures that leave states nobody can repair: an owner who still has
  groups they created, and the last admin of a group that still has other members.

  You do need a **public deletion-request URL** for the form, reachable by someone who cannot
  sign in. A marketing-site page saying how to ask, with an address, satisfies it.

---

## 5. Content rating and target audience

**Policy → App content.**

- **Content rating questionnaire.** Answer honestly that the app has user-generated content
  and user-to-user communication. That pulls the rating up (typically Teen / PEGI 12) and
  requires you to confirm there is moderation — which there is: groups are invite-only, only an
  ADMIN publishes, and membership is revocable. Say so.
- **Target audience.** Select 18+, or 13+ at the lowest. Do **not** include under-13 age
  bands: that triggers Families policy and COPPA obligations, and the app collects a birthday
  and a device token.
- **Data safety, ads, news, government apps** — Grapevine has no ads; declare none.

---

## 6. Signing

Play App Signing is mandatory for new apps and is what you get by default. The distinction
that matters:

- **App signing key** — Google holds it, signs what users install, and it can never be lost.
- **Upload key** — yours, signs the `.aab` you upload, and proves it came from you.

The upload key is the one in `android/keystore.properties`. **Back it up.** Losing it is
recoverable (Google can reset it) but the reset takes days; losing it *before* the first upload
just means generating another.

```bash
npm run release:android -- --dry   # prints the exact keytool command if no keystore exists
```

Keep the `.jks` outside the repo — `android/.gitignore` blocks `*.jks` and
`keystore.properties`, but the safe place is somewhere backed up, not somewhere ignored.

---

## 7. Service account, for `npm run release:android`

Needed only for automated uploads; `--dry` never touches it.

1. **Google Cloud Console** → the project linked to this Play account → **IAM & Admin →
   Service Accounts → Create**. Name it `grapevine-release`.
2. On that account → **Keys → Add key → Create new key → JSON**. Save it outside the repo.
3. **Play Console → Users and permissions → Invite new users**, paste the service account's
   email, and grant **app-level** access to Grapevine with *Release to testing tracks* and
   *Release apps to production* as appropriate. App-level, not account-level — the key should
   not be able to touch a second app you add later.
4. Point the script at it:

   ```bash
   # .env  (or .env.production — the script reads Next's precedence order)
   PLAY_SERVICE_ACCOUNT_KEY=/Users/robpaul/keys/grapevine-play.json
   ```

Permission changes take a few minutes to propagate; a fresh key that 403s is usually just
early.

---

## 8. The first release is manual

`edits:commit` cannot create a listing. The store entry, content rating, data safety and
target audience are one-time console work, and the API only takes over from the second upload.

```bash
# once the deployed HTTPS API exists and .env.production points at it
npm version patch                    # 0.1.0 → 0.1.1, tagged
npm run release:android -- --dry     # builds + signs, uploads nothing
```

Then **Test and release → Testing → Internal testing → Create new release**, drag in
`android/app/build/outputs/bundle/release/app-release.aab`, and add testers by email.
Internal testing has no review delay and is the right first target.

Store listing assets you will need at this point:

| Asset | Spec |
| --- | --- |
| App icon | 512×512 PNG, 32-bit, no transparency |
| Feature graphic | 1024×500 PNG/JPG |
| Phone screenshots | 2–8, min 1080px on the short edge |
| Short description | 80 chars |
| Full description | 4000 chars |

`npm run icons` generates the launcher icons but **not** the store assets — those are
separate files at different sizes.

---

## 9. Every release after that

```bash
npm version patch
npm run release:android
```

That builds the export, syncs it, signs the bundle, and publishes to the internal track. The
version comes from `package.json` and nothing rewrites a tracked file.

```bash
npm run release:android -- --track alpha --draft --notes "Fixes comment ordering"
npm run release:android -- --skip-build      # re-upload the bundle already built
```

Promotion between tracks (internal → closed → production) stays in the console, deliberately:
promoting is a judgement call, not a build step.

### Forcing everyone onto a release

```bash
npm run release:android -- --force-user-update
```

The release goes out as usual, and then `minimum_version` in Firebase Remote Config is set to
the version just published. Every phone still on an older build opens on a drawer it cannot
dismiss, offering the Play listing (see `<UpdateRequired/>`). An ordinary release never touches
that value, because being one patch behind is not a reason to stand between a parishioner and
their parish.

Three things to know before using it:

1. **It needs the Firebase service account, not the Play one** — `FCM_PROJECT_ID`,
   `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`. The generated `firebase-adminsdk-*` account already has
   the role that covers publishing a Remote Config template; a hand-made one would need
   "Firebase Remote Config Admin" granted under Google Cloud → IAM.
2. **The floor applies before Play finishes rolling out.** A phone reads the flags on its next
   launch or foreground, which can easily be before the new build is downloadable, and on the
   internal track it is downloadable only by testers. Watch the rollout, and lower the value in
   the Firebase console if it went up too early.
3. **It is refused with `--dry`**, which would raise a floor for a bundle nobody can install.

Lowering or clearing the floor is a console edit; there is no flag for it, because retreating
from a wall is not something to do from a build script.

> `build:native` overwrites `.next` with the static export, so run `npm run build` again before
> `npm run start`. The script says so when it finishes.

---

## Before the first upload

Done as of 2026-09-03: the organization account is verified, the API is deployed and answers a
native preflight correctly at `https://www.throughgrapevine.com/api`, and production carries
every table in the schema including `device_token`.

Left:

1. The upload keystore, generated and backed up.
2. The reviewer account (§2), provisioned against production, in a group with visible posts.
3. A hosted privacy policy URL, and a public account-deletion-request URL.
4. Store listing assets — a 512×512 icon, a 1024×500 feature graphic, 2–8 screenshots.

None is blocked on anything external. The DUNS number blocks **Apple only**.

> **Use the canonical host, not the apex.** `throughgrapevine.com` 308-redirects to `www`, and
> a CORS preflight is never redirected — it fails as a network error. Every request the app
> makes carries an `Authorization` header, which is exactly what forces a preflight, so an apex
> build fails on *every* call while looking healthy in a browser (the web app is same-origin and
> never preflights). `release-android.mjs` now sends that preflight before building and refuses
> on a redirect or a missing allow-origin; `--skip-probe` overrides.
