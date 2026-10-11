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

@Injectable({ providedIn: 'root' })
export class PushNativeGateway {
  isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }

  platform(): PushPlatform | null {
    const platform = Capacitor.getPlatform();
    return platform === 'android' || platform === 'ios' ? platform : null;
  }

  /** True when the person allowed notifications (asks once; the OS remembers the answer). */
  async requestPermission(): Promise<boolean> {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    const result = await FirebaseMessaging.requestPermissions();
    return result.receive === 'granted';
  }

  async getToken(): Promise<string | null> {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    const { token } = await FirebaseMessaging.getToken();
    return token || null;
  }

  async deleteToken(): Promise<void> {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    await FirebaseMessaging.deleteToken();
  }

  async onTokenRefresh(listener: (token: string) => void): Promise<void> {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    await FirebaseMessaging.addListener('tokenReceived', event => listener(event.token));
  }

  async onNotificationTapped(listener: () => void): Promise<void> {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    await FirebaseMessaging.addListener('notificationActionPerformed', () => listener());
  }
}
