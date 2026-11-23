// Thin wrapper around the native push plugin (@capacitor-firebase/messaging), for the same reasons
// as AppUpdateNativeGateway: Capacitor plugins are Proxies that jasmine cannot spy on reliably, and
// the plugin must never be imported on the web path. Everything is loaded lazily, and only on a
// native build, so the web bundle never pays for it.
//
// Why the Firebase plugin and not @capacitor/push-notifications: on iOS the latter hands back the
// raw APNs token, which FCM cannot send to; this one returns an FCM registration token on both
// Android and iOS, which is what the API's FCM sender (FcmPushSender) addresses.
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

export type PushPlatform = 'android' | 'ios';

/** What the operating system says about notifications for this app. */
export type PushPermissionState = 'granted' | 'prompt' | 'denied';

/** The notification channel the API's pushes arrive on (also named in AndroidManifest.xml). */
export const ANDROID_PUSH_CHANNEL_ID = 'hudhudnest_default';

/** One loader for every call (also keeps the web bundle small: each import() site costs bytes there). */
const messaging = () => import('@capacitor-firebase/messaging').then(m => m.FirebaseMessaging);

@Injectable({ providedIn: 'root' })
export class PushNativeGateway {
  isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }

  platform(): PushPlatform | null {
    const platform = Capacitor.getPlatform();
    return platform === 'android' || platform === 'ios' ? platform : null;
  }

  /**
   * Where the permission stands, WITHOUT showing the system dialog. Android 12 and older never ask (granted by
   * default); Android 13+ and iOS ask once, and 'denied' can only be changed in the system settings afterwards.
   */
  async checkPermission(): Promise<PushPermissionState> {
    const FirebaseMessaging = await messaging();
    const result = await FirebaseMessaging.checkPermissions();
    return result.receive === 'granted' ? 'granted' : result.receive === 'denied' ? 'denied' : 'prompt';
  }

  /** Android only: the channel must exist before the first push, or Android files it under "Miscellaneous". */
  async ensureAndroidChannel(name: string): Promise<void> {
    if (this.platform() !== 'android') {
      return;
    }
    const FirebaseMessaging = await messaging();
    await FirebaseMessaging.createChannel({ id: ANDROID_PUSH_CHANNEL_ID, name, importance: 4 });
  }

  /** True when the person allowed notifications (asks once; the OS remembers the answer). */
  async requestPermission(): Promise<boolean> {
    const FirebaseMessaging = await messaging();
    const result = await FirebaseMessaging.requestPermissions();
    return result.receive === 'granted';
  }

  async getToken(): Promise<string | null> {
    const FirebaseMessaging = await messaging();
    const { token } = await FirebaseMessaging.getToken();
    return token || null;
  }

  async deleteToken(): Promise<void> {
    const FirebaseMessaging = await messaging();
    await FirebaseMessaging.deleteToken();
  }

  async onTokenRefresh(listener: (token: string) => void): Promise<void> {
    const FirebaseMessaging = await messaging();
    await FirebaseMessaging.addListener('tokenReceived', event => listener(event.token));
  }

  /** Calls back with the data the server attached to the push (type, targetKind, ids), when the person taps it. */
  async onNotificationTapped(listener: (data: Record<string, string>) => void): Promise<void> {
    const FirebaseMessaging = await messaging();
    await FirebaseMessaging.addListener('notificationActionPerformed', event => {
      const data = (event.notification?.data ?? {}) as Record<string, unknown>;
      const strings: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') strings[key] = value;
      }
      listener(strings);
    });
  }
}
