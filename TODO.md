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

## Production database — will break push the moment it deploys

`.env.production` already carries the `FCM_*` credentials, but it points `DATABASE_URL` at
hosted Supabase, and **`device_token` does not exist there yet.** The deployed API will throw
the same `P2021` on every like and publish that the local one did before the migration.

Before (or with) the next deploy, against the production URLs:

```bash
npx prisma migrate deploy
npm run db:secure          # a migration that adds a table adds it unprotected
```

## Google Play — blocked on the same DUNS number, plus three real items

A **D-U-N-S number is required for an organization developer account on Play too**, so the
store half of both platforms is waiting on the same thing. Note this blocks *distribution*
only — push already works on Android from a debug build, as proven on device.

Still open, independent of the DUNS number:

- **There is no release signing config.** `android/app/build.gradle` has `buildTypes.release`
  but no `signingConfigs` at all, so a release build is unsigned and Play will reject it.
  Generate an upload keystore, keep it somewhere durable (losing it means losing the ability
  to update the listing), and wire it in — with the credentials in `gradle.properties` or the
  environment, never committed.
- **Privacy policy URL and the Data safety form.** Play requires both, and this app collects
  an email, a name, a birthday, and now a device token — the form has to say so.

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
