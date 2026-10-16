import { Capacitor } from '@capacitor/core';

/**
 * True inside the installed Capacitor app (Android/iOS), false in a browser. Used to hide things that only make
 * sense on the website, such as the "Download the app" link: the app is already installed.
 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
