// =====================================================================
// ✅ Unit Tests – theme.service.spec.ts
// تغطية: تحديد الثيم الابتدائي (localStorage أولوية على تفضيل النظام)،
// toggle()، الحفظ بـlocalStorage، وضبط data-theme على <html>، ومقاومة
// فشل localStorage (وضع التصفح الخاص).
// =====================================================================
import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

const STORAGE_KEY = 'aqar-tech-theme';

/** يبني matchMedia وهمي يُرجع matches بالقيمة المطلوبة، بغض النظر عن الاستعلام. */
function stubMatchMedia(prefersDark: boolean): void {
  spyOn(window, 'matchMedia').and.returnValue({
    matches: prefersDark,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  } as unknown as MediaQueryList);
}

describe('ThemeService', () => {
  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  // ────────────── التحديد الابتدائي ──────────────

  it('✅ لا يوجد ثيم محفوظ + النظام يفضّل الداكن ⇒ يبدأ داكن', () => {
    localStorage.removeItem(STORAGE_KEY);
    stubMatchMedia(true);

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('✅ لا يوجد ثيم محفوظ + النظام يفضّل الفاتح ⇒ يبدأ فاتح', () => {
    localStorage.removeItem(STORAGE_KEY);
    stubMatchMedia(false);

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('✅ ثيم محفوظ بـlocalStorage له الأولوية على تفضيل النظام', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    // النظام يفضّل الفاتح، لكن المستخدم كان اختار الداكن يدويًا سابقًا —
    // اختياره اليدوي يجب أن يفوز.
    stubMatchMedia(false);

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
  });

  it('✅ قيمة تالفة بـlocalStorage (ليست dark/light) تُهمَل ويُرجع لتفضيل النظام', () => {
    localStorage.setItem(STORAGE_KEY, 'blue' as any);
    stubMatchMedia(true);

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
  });

  // ────────────── setTheme / toggle ──────────────

  it('✅ setTheme() يحدّث الإشارة، وdata-theme على <html>، ويحفظ بـlocalStorage', () => {
    stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);

    service.setTheme('dark');

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('✅ toggle() من فاتح لداكن', () => {
    stubMatchMedia(false); // يبدأ فاتح
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('light');

    service.toggle();

    expect(service.theme()).toBe('dark');
  });

  it('✅ toggle() من داكن لفاتح', () => {
    stubMatchMedia(true); // يبدأ داكن
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('dark');

    service.toggle();

    expect(service.theme()).toBe('light');
  });

  it('✅ toggle() مرتين يرجع لنفس الثيم الأصلي', () => {
    stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    const original = service.theme();

    service.toggle();
    service.toggle();

    expect(service.theme()).toBe(original);
  });

  // ────────────── مقاومة فشل localStorage (وضع خاص) ──────────────

  it('✅ فشل localStorage.getItem عند البدء لا يكسر الخدمة (يرجع لتفضيل النظام)', () => {
    spyOn(localStorage, 'getItem').and.throwError('SecurityError: private mode');
    stubMatchMedia(true);

    let service!: ThemeService;
    expect(() => (service = TestBed.inject(ThemeService))).not.toThrow();
    expect(service.theme()).toBe('dark');
  });

  it('✅ فشل localStorage.setItem عند setTheme لا يكسر تحديث الإشارة/الـDOM', () => {
    stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    spyOn(localStorage, 'setItem').and.throwError('QuotaExceededError');

    expect(() => service.setTheme('dark')).not.toThrow();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
