# TODO

Short-lived, actionable items only. Anything that is a *decision* rather than a task belongs
in `CLAUDE.md` or `.claude/skills/develop/*.md`, not here.

---

## Push notifications — the iOS half is blocked

**Blocked on: a DUNS number**, needed for Apple Developer Program enrollment as an
organization. Everything downstream of it is waiting; nothing else about push is.

As of 2026-08-27 the Android and server halves are done and verified end to end. The iOS
device half is the only gap, and it cannot be closed until the developer account exists.

### When the DUNS number arrives

1. **Enrol in the Apple Developer Program** and create the App ID for
   `com.throughgrapevine.app` with the **Push Notifications** capability enabled.
2. **Mint an APNs auth key** — Apple Developer portal → Keys → new key with *Apple Push
   Notifications service* checked. The `.p8` can only be downloaded **once**; keep it
   somewhere durable.
3. **Upload it to Firebase** → Project settings → Cloud Messaging → APNs Authentication Key,
   with its Key ID and your Team ID. Without this step iOS registers happily and receives
   nothing, which is the least obvious failure in the whole feature.
4. **Xcode** → App target → Signing & Capabilities → add **Push Notifications**. The
   capability *is* the `aps-environment` entitlement, and a free personal team cannot sign
   one, so this waits on the paid account rather than on anyone finding the time.
5. Test on a **physical iPhone**. APNs does not work on the Simulator, ever.

## Production database — migrated

`device_token` is present in production as of 2026-09-03, along with every other table in the
schema, so the `P2021` this section warned about is gone. The standing rule is unchanged and is
the thing to remember after the *next* migration:

```bash
npx prisma migrate deploy
npm run db:secure          # a migration that adds a table adds it unprotected
```

## Google Play — not blocked. The DUNS number is an Apple problem only

The Blackbox Studios **organization** account (`6507276289092695069`) has identity and website
ownership verified as of 2026-09-02, so Play needs no D-U-N-S number: that requirement applies
to an organization whose Payments profile is unverified, and this one is not. The **12 testers
for 14 days** gate does not apply either — that is for *personal* accounts created after
2023-11-13. Nothing external is holding up an Android release.

Step-by-step console work is in `RELEASING.md`. The items below are the ones with code or
content behind them.

Still open:

- **Deploy, so `/privacy` and `/delete-account` are live.** Everything else about the API is
  done: it answers at `https://www.throughgrapevine.com/api` and passes a native CORS preflight.
  The two legal pages exist in the repo but are not yet on the deployed site, and Play will not
  accept URLs that 404.
- **The Data safety form.** The policy itself is written and served at `/privacy` and
  `/delete-account` (`src/components/Legal.jsx`), ungated and statically prerendered; the
  completed data-safety mapping is in `RELEASING.md`. What is left is filling the form in and
  pasting those two URLs — after the next deploy, since neither is live yet.
- **`support@blackboxstudios.com` has to be a mailbox somebody reads.** It is published in the
  privacy policy and is the only route a person has to a correction or an erasure request, which
  `npm run erase` then answers.
- **Provision the reviewer account and set its code**, against production, once the API is
  deployed: `npm run reviewer -- review@throughgrapevine.com --org <slug>`, then `REVIEW_EMAIL`
  and `REVIEW_OTP` in `.env.production`. Unset both and run `--revoke` when review is over —
  they are separate steps because a resubmission needs only `--org` again.
- **The first release has to go through the console by hand.** `edits:commit` cannot create a
  listing: the store entry, content rating and target audience are one-time console work, and
  the API only takes over from the second upload. Use `--dry` and upload that `.aab` manually.
- **Store listing assets.** `npm run icons` does not produce these: a 512×512 icon, a 1024×500
  feature graphic, and 2–8 phone screenshots.

Done (2026-09-03):

- ~~No upload keystore~~ — generated at `Projects/Me/certs/grapevine-upload.jks` (outside any
  git repo), wired through the untracked `android/keystore.properties`. Verified: the bundle is
  signed by `CN=Robert Paul, O=Blackbox Studios`, valid to 2054, and `jarsigner -verify` passes.
  **Back that file up somewhere off this machine** — losing it means losing the ability to
  update the listing.
- ~~No release signing config~~ — `android/app/build.gradle` now declares `signingConfigs.release`
  from `android/keystore.properties` or `GRAPEVINE_STORE_*`/`_KEY_*`, and only when all four are
  present, so a checkout without the keystore still configures and builds.
- ~~Versioning was hand-maintained~~ — Gradle derives `versionName` and `versionCode` by reading
  `package.json` (`0.1.0` → `100`), so `npm version patch` is the whole bump and no release step
  rewrites a tracked file.
- ~~Nothing automated the upload~~ — `npm run release:android` builds, syncs, signs, and drives
  the Play Developer API (`edits.insert` → `bundles.upload` → `tracks.update` → `commit`),
  discarding the edit if any step fails. `--dry` stops after signing.

Done (2026-08-27):

- ~~`webContentsDebuggingEnabled: true` leaking into release builds~~ — key removed from
  `capacitor.config.json`. Capacitor defaults it to the build's own debug flag, so
  `chrome://inspect` still works on debug and release is no longer inspectable.
- ~~`allowBackup="true"` exporting the session~~ — now `false`, with
  `res/xml/backup_rules.xml` (API ≤ 30) and `res/xml/data_extraction_rules.xml` (API 31+)
  excluding `CapacitorStorage.xml` from both cloud backup and device-to-device transfer.
- ~~No notification icon or channel~~ — `res/drawable/ic_notification.xml` plus a
  `notification_accent` colour, wired through the manifest's `default_notification_icon` /
  `_color` / `_channel_id` metadata, and the `parish` channel created at runtime by
  `ensurePushChannel` in `src/lib/push.js`.

  > **The channel id `parish` is now effectively permanent.** Android gives an existing
  > channel's name and importance to the *user* — re-creating it with different values does
  > nothing. Changing the label means shipping a new id and orphaning the old one.

## Untested paths

- **Tap-to-open.** Delivery is proven on Android; tapping a banner to land on the post is
  not. Two cases, and the second is the one with moving parts: with the app **open**, and
  from a **cold launch** — where the plugin replays the tap before the session resolves, so
  the destination is parked in the push store's `pending` and flushed by `usePushListeners`
  once `ready`. Test both.
- **The welcome step.** `NotificationsStep` in `src/app/(gateway)/welcome/page.jsx` only
  appears for a native viewer whose OS has never been asked, which means testing it needs a
  fresh install *and* a profile with `onboardedAt` still null (`npm run dev:reset-member`).

## Deferred by design (not blocked, not scheduled)

- **Web push.** Needs a service worker at a fixed path plus a VAPID key, and its permission
  prompt is a different piece of UX from the native one. `DeviceToken.platform` already
  accepts `"web"` so landing it is not a migration. See the header of `src/lib/push.js`.
- **Pruning by `seenAt`.** A token FCM has never rejected but that no device has presented in
  months is an uninstalled app. Nothing sweeps those today; the column is there for when it
  is worth a job.
- **Notification grouping** ("and 9 others") — a read-side change, planned in detail in the
  header of `src/lib/server/notifications.service.js`.

## The Daily Read owes an About page — a licence condition, not a nicety

The reading is fetched at runtime from `github.com/jaredef/ochrid`, which is **CC BY-NC 4.0**
and whose README states the underlying translation is third-party copyrighted material
carried under a fair-use claim. Naming the source is a condition of that licence, so this
gates showing the screen to a parish rather than being tidy-up.

The block was drawn at the foot of the reading and was taken off it deliberately — that page
should end on the text — so it is **relocated, not dropped**. Nothing renders it today, which
is the gap.

Build `/settings/about` as a sibling of `/settings/info` and `/settings/general`, reached by a
row on the account index and drawn by the shared `<SettingsRow/>`. It carries:

- The Prologue of Ohrid by St. Nikolai Velimirovic
- Text from **ochrid.org**, CC BY-NC 4.0
- Fasting rule from **orthocal.info**

Both links go through `<Hyperlink soft>` — never a bare `underline`, per the Hyperlinks rule.

> The NonCommercial term is a live question for counsel, since Grapevine has a paid tier.
> Attribution is the part that is unambiguous and cheap; do it regardless of how that lands.

Likely the right home for the app version and any future terms/privacy links too — Play
already needs a privacy policy URL (see the Google Play section above).
