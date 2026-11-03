import { Injectable, computed, signal } from '@angular/core';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

/** The theme that is actually painted. */
export type AppTheme = 'light' | 'dark';
/** What the user chose: a fixed theme, or "follow the device". */
export type ThemePreference = AppTheme | 'system';

export const THEME_STORAGE_KEY = 'hudhudnest-theme';
/** المفتاح القديم من علامة AqarTech قبل إعادة التسمية — يُقرأ مرة واحدة فقط للترحيل. */
const LEGACY_STORAGE_KEY = 'aqar-tech-theme';
/** Browser chrome colour per theme (must match the navbar/page background). */
const THEME_COLOR: Record<AppTheme, string> = { light: '#0F2742', dark: '#0a0a0c' };
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * ThemeService — owns light/dark for the whole app.
 *
 * Mechanism: sets `data-theme="dark|light"` on <html>; every colour is a CSS custom property in
 * styles/_tokens.scss that changes with that attribute, so no component listens for theme changes.
 *
 * Preference model:
 *  - 'system' (default, nothing stored): follows the OS setting live, including while the app is open.
 *  - 'light' | 'dark': an explicit choice, stored under THEME_STORAGE_KEY and never overridden by the OS.
 * The same decision runs before first paint from an inline script in index.html (no flash); this service
 * takes over once Angular boots and keeps both in agreement.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(this.readStoredPreference());
  private readonly systemDark = signal<boolean>(this.systemPrefersDark());
  /** Effective theme (what is painted). Kept as `theme` because existing templates read it. */
  readonly theme = computed<AppTheme>(() => {
    const pref = this.preference();
    return pref === 'system' ? (this.systemDark() ? 'dark' : 'light') : pref;
  });

  constructor() {
    this.apply();
    this.listenToSystem();
    this.listenToOtherTabs();
  }

  /** Flip the *effective* theme and remember it as an explicit choice. */
  toggle(): void {
    this.setPreference(this.theme() === 'dark' ? 'light' : 'dark');
  }

  /** Back-compat: choosing a concrete theme. */
  setTheme(theme: AppTheme): void {
    this.setPreference(theme);
  }

  setPreference(pref: ThemePreference): void {
    this.preference.set(pref);
    try {
      if (pref === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, pref);
      }
    } catch {
      /* localStorage قد يكون غير متاح (وضع خاص) — نتجاهل بصمت */
    }
    this.apply();
  }

  private apply(): void {
    const theme = this.theme();
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
    this.syncNativeBars(theme);
  }

  /** Android/iOS status + navigation bar icons: light icons on a dark page and vice versa. */
  private syncNativeBars(theme: AppTheme): void {
    try {
      if (!Capacitor.isNativePlatform()) {
        return;
      }
      // Capacitor 8 core plugin; DARK = light icons for a dark page.
      void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
    } catch {
      /* the bars keep their default style — cosmetic only */
    }
  }

  private listenToSystem(): void {
    try {
      const mq = window.matchMedia?.(DARK_QUERY);
      mq?.addEventListener?.('change', event => {
        this.systemDark.set(event.matches);
        if (this.preference() === 'system') {
          this.apply();
        }
      });
    } catch {
      /* old WebView without matchMedia events */
    }
  }

  /** A choice made in another tab/window is applied here too. */
  private listenToOtherTabs(): void {
    window.addEventListener?.('storage', event => {
      if (event.key === THEME_STORAGE_KEY) {
        this.preference.set(this.parse(event.newValue));
        this.apply();
      }
    });
  }

  private readStoredPreference(): ThemePreference {
    try {
      return this.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? this.migrateLegacyTheme());
    } catch {
      return 'system';
    }
  }

  private parse(value: string | null | undefined): ThemePreference {
    return value === 'dark' || value === 'light' ? value : 'system';
  }

  private systemPrefersDark(): boolean {
    try {
      return typeof window !== 'undefined' && !!window.matchMedia?.(DARK_QUERY).matches;
    } catch {
      return false;
    }
  }

  /**
   * ترحيل لمرة واحدة من مفتاح AqarTech القديم (LEGACY_STORAGE_KEY) بعد إعادة تسمية
   * العلامة إلى HudhudNest — يحافظ على تفضيل الوضع الداكن/الفاتح للمستخدمين الحاليين.
   */
  private migrateLegacyTheme(): string | null {
    try {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(THEME_STORAGE_KEY, legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      return legacy;
    } catch {
      return null;
    }
  }
}
