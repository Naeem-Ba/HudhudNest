import { Injectable, signal } from '@angular/core';

export type AppTheme = 'light' | 'dark';

const STORAGE_KEY = 'aqar-tech-theme';

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
      const saved = localStorage.getItem(STORAGE_KEY);

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
}
