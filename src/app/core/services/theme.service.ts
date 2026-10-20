import { Injectable, signal } from '@angular/core';

export type AppTheme = 'light' | 'dark';

const STORAGE_KEY = 'hudhudnest-theme';
/** المفتاح القديم من علامة AqarTech قبل إعادة التسمية — يُقرأ مرة واحدة فقط للترحيل. */
const LEGACY_STORAGE_KEY = 'aqar-tech-theme';

/**
 * ThemeService — يتحكم بالوضع الداكن/الفاتح لكامل التطبيق.
 *
 * الآلية: يضبط data-theme="dark|light" على <html>، وكل الألوان في
 * styles.scss معرّفة كـ CSS Custom Properties تتغيّر تلقائيًا حسب
 * هذا الـ attribute — لا حاجة لأي كومبوننت يستمع لهذا التغيير بنفسه
 * طالما يستخدم var(--surface) / var(--gray-*) / إلخ بدل ألوان ثابتة.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<AppTheme>(this.resolveInitialTheme());

  constructor() {
    this.applyTheme(this.theme());
  }

  toggle(): void {
    this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: AppTheme): void {
    this.theme.set(theme);
    this.applyTheme(theme);

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* localStorage قد يكون غير متاح (وضع خاص) — نتجاهل بصمت */
    }
  }

  private applyTheme(theme: AppTheme): void {
    document.documentElement.setAttribute('data-theme', theme);
  }

  private resolveInitialTheme(): AppTheme {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? this.migrateLegacyTheme();

      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
    } catch {
      /* تجاهل */
    }

    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches;

    return prefersDark ? 'dark' : 'light';
  }

  /**
   * ترحيل لمرة واحدة من مفتاح AqarTech القديم (LEGACY_STORAGE_KEY) بعد إعادة تسمية
   * العلامة إلى HudhudNest — يحافظ على تفضيل الوضع الداكن/الفاتح للمستخدمين الحاليين
   * بدل إعادتهم فجأة لتفضيل النظام الافتراضي.
   */
  private migrateLegacyTheme(): string | null {
    try {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      return legacy;
    } catch {
      return null;
    }
  }
}
