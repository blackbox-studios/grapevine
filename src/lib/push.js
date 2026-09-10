import { FirebaseMessaging } from "@capacitor-firebase/messaging"
import { AndroidSettings, IOSSettings, NativeSettings } from "capacitor-native-settings"

import { isNative, platform } from "@/lib/native"

/* The device's side of push: asking the OS, holding the FCM token, and turning a tap on a
 * banner into a route. Plain module, no React — the hook that drives it is
 * `lib/hooks/usePush.hook.js` and the state lives in `lib/store/push/store.js`.
 *
 * Everything here is a no-op off-device, exactly like `native.js`, so callers never branch on
 * the platform.
 *
 * ── Why this plugin and not @capacitor/push-notifications ────────────────────
 *
 * The official plugin does not use Firebase on iOS at all: its `registration` event hands
 * back an **APNs** device token there, and an FCM token only on Android. Two token formats
 * means two senders on the server, two sets of credentials to rotate, two error taxonomies to
 * learn, and a `provider` discriminator on `DeviceToken` that every send site has to branch
 * on. `@capacitor-firebase/messaging` returns an FCM token on both platforms, so the server
 * has one transport (`lib/server/push.js`) and the table has one kind of row.
 *
 * The cost is the Firebase iOS SDK in the CocoaPods build and the `firebase` JS package as an
 * (optional) peer. That package exists **only to satisfy the bundler**: the plugin's web
 * implementation statically imports `firebase/messaging`, and webpack resolves that import
 * whether or not the code ever runs. It is behind `registerPlugin`'s lazy `import('./web')`,
 * so on native the chunk is emitted and never fetched. When web push lands it is already
 * there; until then it is dead weight on disk and nothing on the boot path.
 *
 * ── Why there is no web push yet ─────────────────────────────────────────────
 *
 * Web push needs a service worker at a fixed path plus a VAPID key, and its permission prompt
 * is a different piece of UX from the native one — a browser will refuse the prompt outright
 * if it is fired without a gesture. It is a separate delivery path, not a flag on this one.
 * `DeviceToken.platform` already accepts "web" so that landing it is not a migration. */

/* Whether push can work at all here. Native only today — see the header. */
export const pushSupported = () => isNative()

/* Asks the OS, and reports whether it said yes.
 *
 * **Only ever called from a deliberate moment**, never on boot: iOS shows the system prompt
 * exactly once per install, and a "Don't Allow" is final until the person finds the app in
 * Settings. Spending it during the splash — before anyone has seen a notification worth
 * having — is how an app ends up permanently unable to reach most of its users. See
 * `usePush` for where it is actually fired.
 *
 * `checkPermissions` first, because `requestPermissions` on an already-decided install
 * resolves from the stored answer rather than re-prompting, and treating that as a fresh ask
 * would hide a denial behind what looks like a question. */
export const requestPushPermission = async () => {
    if (!pushSupported()) return false

    try {
        const current = await FirebaseMessaging.checkPermissions()
        if (current.receive === "granted") return true
        if (current.receive === "denied") return false

        const asked = await FirebaseMessaging.requestPermissions()
        return asked.receive === "granted"
    } catch {
        return false
    }
}

/* Whether permission is already granted, without asking for it. Null when it has never been
 * decided, which is the one state worth distinguishing: it is the only one where prompting
 * would actually show a prompt. */
export const pushPermission = async () => {
    if (!pushSupported()) return "denied"

    try {
        const { receive } = await FirebaseMessaging.checkPermissions()
        return receive === "prompt" || receive === "prompt-with-rationale" ? null : receive
    } catch {
        return "denied"
    }
}

/* Hands the reader to the OS's own notification settings for this app, reporting whether it
 * got there. Belongs to the `denied` state alone: it is the only way to turn push on once the
 * prompt is spent, which is the state `pushPermission` reserves that value for, and anywhere
 * one can still be shown this would be sending somebody to Settings for a question the app
 * could have asked them itself.
 *
 * `IOSSettings.AppNotification` resolves to Apple's public `openNotificationSettingsURLString`
 * (16+) or `openSettingsURLString`, and Android to ACTION_APP_NOTIFICATION_SETTINGS. **Most of
 * that enum's other members are the undocumented `App-prefs:` schemes, and shipping one is an
 * App Store rejection.** */
export const openPushSettings = async () => {
    if (!pushSupported()) return false

    try {
        const { status } = await NativeSettings.open({
            optionAndroid: AndroidSettings.AppNotification,
            optionIOS: IOSSettings.AppNotification,
        })
        return status === true
    } catch {
        return false
    }
}

/* This installation's FCM token, or null.
 *
 * Throws nothing. A device with no Play Services, a simulator with no APNs, a revoked
 * permission — all of them are "no token", which is a state the app runs fine in. */
export const pushToken = async () => {
    if (!pushSupported()) return null

    try {
        const { token } = await FirebaseMessaging.getToken()
        return token || null
    } catch {
        return null
    }
}

/* Forgets the token on the device side, so FCM stops issuing this one.
 *
 * Paired with — not a substitute for — the DELETE that removes the row on the server. The
 * server-side removal is what actually stops delivery; this is what keeps the next sign-in
 * from re-registering the same token the previous person's row was keyed on. */
export const deletePushToken = async () => {
    if (!pushSupported()) return

    try {
        await FirebaseMessaging.deleteToken()
    } catch {
        /* Nothing to do about it, and nothing depends on it having worked. */
    }
}

/* The platform string the API stores. Mirrors `Capacitor.getPlatform()`. */
export const pushPlatform = () => platform()

/* ------------------------------------------------------------------------- */
/* Android notification channel                                              */
/* ------------------------------------------------------------------------- */

/* The channel every push is posted to. Must match
 * `com.google.firebase.messaging.default_notification_channel_id` in AndroidManifest.xml —
 * the manifest *names* the channel, and this *creates* it, and on API 26+ a message naming a
 * channel that does not exist is silently not shown at all. */
const CHANNEL_ID = "parish"

/* Creates it, idempotently, on every launch.
 *
 * **Android only, and only because the alternative is worse.** Left to FCM, notifications
 * land in an auto-created channel named "Miscellaneous" — which is the label a reader finds
 * in Android's per-app notification settings when they go looking for a switch, and it tells
 * them nothing about what they would be turning off. Declaring one is what makes that screen
 * say "Parish".
 *
 * Creating a channel that already exists is a no-op at the platform level, so this needs no
 * has-it-been-done bookkeeping. **The importance and the name of an existing channel cannot
 * be changed by re-creating it** — once a channel id has shipped, the user owns its settings
 * and only they can change them. Changing the *label* therefore means a new id and orphaning
 * the old one, which is why it is worth getting right the first time rather than iterating. */
export const ensurePushChannel = async () => {
    if (!pushSupported() || platform() !== "android") return

    try {
        await FirebaseMessaging.createChannel({
            id: CHANNEL_ID,
            name: "Parish",
            description: "Posts from your parish, and likes on what you write.",
            /* 4 = IMPORTANCE_HIGH: shows as a heads-up banner and makes a sound. This is the
             * whole point of the feature — a parish announcement that arrives silently in the
             * tray is one nobody reads. */
            importance: 4,
            visibility: 1,
        })
    } catch {
        /* A device that would not take the channel still receives pushes through the default
         * one. Nothing here is worth failing a launch over. */
    }
}

/* ------------------------------------------------------------------------- */
/* Listeners                                                                 */
/* ------------------------------------------------------------------------- */

/* Subscribes to the SDK rotating this installation's token. Returns an unsubscribe.
 *
 * **Not optional.** FCM replaces a token on app reinstall, on a data restore to a new handset,
 * and periodically on its own schedule. Registering once at sign-in and never again means a
 * device quietly stops receiving anything the first time that happens, with no error anywhere
 * — the server keeps sending to a token FCM has already retired, and the only symptom is
 * silence. */
export const onPushTokenChange = (handler) => {
    if (!pushSupported()) return () => {}

    const listener = FirebaseMessaging.addListener("tokenReceived", ({ token }) => {
        if (token) handler(token)
    })

    return () => {
        listener.then((handle) => handle.remove()).catch(() => {})
    }
}

/* A push that arrived while the app was open and on screen.
 *
 * The OS does not draw a banner in this case, and it should not — the reader is already
 * looking at the app. What it means for us is that the panel behind the bell is out of
 * date, and — when the payload names a conversation — that a messaging surface may be
 * showing a thread that just moved. The handler gets the payload's `data` so it can tell
 * those apart; nothing is ever spliced into a list from it, because the row is the
 * notification and re-reading is more honest than trusting a payload. See the header of
 * `lib/store/notifications/store.js`. */
export const onPushReceived = (handler) => {
    if (!pushSupported()) return () => {}

    const listener = FirebaseMessaging.addListener("notificationReceived", (event) =>
        handler(event?.notification?.data ?? {}),
    )

    return () => {
        listener.then((handle) => handle.remove()).catch(() => {})
    }
}

/* Somebody tapped a banner. `handler` gets the payload's `data` — the destination it carried,
 * which is a `postId` for anything that happened inside a post and a `handle` for a follow.
 *
 * This fires for a cold launch too — the plugin replays the tap that started the process — so
 * the handler has to be able to run before the app has finished booting. That is why routing
 * it is the *store's* job rather than this file's: see `openFromPush` in the push store, which
 * defers the navigation until the app is actually ready to be navigated. */
export const onPushTapped = (handler) => {
    if (!pushSupported()) return () => {}

    const listener = FirebaseMessaging.addListener(
        "notificationActionPerformed",
        (event) => handler(event?.notification?.data ?? {}),
    )

    return () => {
        listener.then((handle) => handle.remove()).catch(() => {})
    }
}

/* Clears the banners this app has left in the shade.
 *
 * Called when the notification panel is opened, so the two agree: having read the list
 * in-app and then still finding a stack of banners outside it is the app telling the reader
 * two different things about the same events. */
export const clearPushNotifications = async () => {
    if (!pushSupported()) return

    try {
        await FirebaseMessaging.removeAllDeliveredNotifications()
    } catch {
        /* Cosmetic. Never worth surfacing. */
    }
}
