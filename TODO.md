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
4. **Xcode** → App target → Signing & Capabilities → add **Push Notifications**.
5. **Add `GoogleService-Info.plist` to the Xcode target** — see the next item, which is
   independent of the DUNS number and can be done now.
6. Test on a **physical iPhone**. APNs does not work on the Simulator, ever.

### Independent of Apple: the plist is not in the Xcode project yet

`ios/App/App/GoogleService-Info.plist` is on disk, but it has no `PBXFileReference` in
`ios/App/App.xcodeproj/project.pbxproj` and is not in the App target's *Copy Bundle
Resources*. The project is `objectVersion = 60` and does not use Xcode 16's
filesystem-synchronized groups, so being in the folder is **not** enough — the file will not
be copied into the built app and `FirebaseApp.configure()` will not find it at launch.

Fix: open `ios/App/App.xcworkspace`, drag the plist into the `App/App` group, and tick
**Add to targets: App**. Verify with:

```bash
grep -c "GoogleService-Info.plist" ios/App/App.xcodeproj/project.pbxproj   # must be > 0
```

## Push notifications — Android polish

Working, but two cosmetic defaults are worth replacing before anyone outside the parish sees
them. Neither blocks delivery.

- **No status-bar notification icon.** Without
  `com.google.firebase.messaging.default_notification_icon` metadata in
  `android/app/src/main/AndroidManifest.xml`, FCM falls back to `@mipmap/ic_launcher`, which
  Android ≥ 5.0 masks to a **white silhouette** — a full-colour launcher icon typically
  renders as a white square. Add a single-colour, transparent-background vector drawable
  (`res/drawable/ic_notification.xml`) and point the metadata at it.
- **No default channel.** FCM auto-creates one named "Miscellaneous", which is what people
  will see in Android's per-app notification settings. Declare a channel and name it
  something meaningful via `com.google.firebase.messaging.default_notification_channel_id`.

## Deferred by design (not blocked, not scheduled)

- **Web push.** Needs a service worker at a fixed path plus a VAPID key, and its permission
  prompt is a different piece of UX from the native one. `DeviceToken.platform` already
  accepts `"web"` so landing it is not a migration. See the header of `src/lib/push.js`.
- **Pruning by `seenAt`.** A token FCM has never rejected but that no device has presented in
  months is an uninstalled app. Nothing sweeps those today; the column is there for when it
  is worth a job.
- **Notification grouping** ("and 9 others") — a read-side change, planned in detail in the
  header of `src/lib/server/notifications.service.js`.
