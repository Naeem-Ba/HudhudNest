// Saves a generated text file from inside the native app (Android/iOS).
//
// The Capacitor WebView ignores <a download> on a blob: URL, so a file built in the page
// (e.g. the account data export) cannot be saved the way the website does it. Instead the
// file is written to the app's cache folder with @capacitor/filesystem and handed to the
// system share sheet with @capacitor/share, where the user picks "Save to Files", Drive,
// email, etc. The cache folder is the one Android's FileProvider already exposes
// (android/app/src/main/res/xml/file_paths.xml → <cache-path>), so no manifest change is
// needed. A thin injectable gateway, like AppUpdateNativeGateway, so tests can replace it
// instead of spying on Capacitor's registerPlugin() proxies.
import { Injectable } from '@angular/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export type NativeFileExportResult = 'shared' | 'cancelled';

@Injectable({ providedIn: 'root' })
export class NativeFileExportGateway {
  async shareTextFile(fileName: string, contents: string, title: string): Promise<NativeFileExportResult> {
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: contents,
      directory: Directory.Cache,
      encoding: Encoding.UTF8
    });

    try {
      await Share.share({ title, files: [uri] });
      return 'shared';
    } catch (error) {
      // Both platforms reject with exactly "Share canceled" when the user closes the sheet —
      // a normal outcome, not a failure.
      if (/cancel/i.test(String((error as { message?: string })?.message ?? error))) {
        return 'cancelled';
      }
      throw error;
    }
  }
}
