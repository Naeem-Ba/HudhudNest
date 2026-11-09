// =====================================================================
// ✅ Unit Tests – theme.service.spec.ts
// تغطية: تحديد الثيم الابتدائي (localStorage أولوية على تفضيل النظام)،
// toggle()، الحفظ بـlocalStorage، وضبط data-theme على <html>، ومقاومة
// فشل localStorage (وضع التصفح الخاص).
// =====================================================================
import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

const STORAGE_KEY = 'hudhudnest-theme';
const LEGACY_STORAGE_KEY = 'aqar-tech-theme';

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
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  // ────────────── التحديد الابتدائي ──────────────

  it('✅ لا يوجد ثيم محفوظ + النظام يفضّل الداكن ⇒ يبدأ فاتح (الفاتح هو الافتراضي)', () => {
    localStorage.removeItem(STORAGE_KEY);
    stubMatchMedia(true);

    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('light');
    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
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

  it('✅ قيمة تالفة بـlocalStorage (ليست dark/light/system) تُهمَل ويُرجع للفاتح الافتراضي', () => {
    localStorage.setItem(STORAGE_KEY, 'blue' as any);
    stubMatchMedia(true);

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('light');
  });

  it('✅ اختيار «حسب الجهاز» المحفوظ (system) يتبع النظام', () => {
    localStorage.setItem(STORAGE_KEY, 'system');
    stubMatchMedia(true);

    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('system');
    expect(service.theme()).toBe('dark');
  });

  // ────────────── ترحيل مفتاح AqarTech القديم ──────────────

  it('✅ ثيم محفوظ تحت المفتاح القديم (AqarTech) يُرحَّل تلقائياً للمفتاح الجديد', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, 'dark');
    stubMatchMedia(false);

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
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
    localStorage.setItem(STORAGE_KEY, 'dark'); // يبدأ داكن
    stubMatchMedia(false);
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

  it('✅ فشل localStorage.getItem عند البدء لا يكسر الخدمة (يرجع للفاتح الافتراضي)', () => {
    spyOn(localStorage, 'getItem').and.throwError('SecurityError: private mode');
    stubMatchMedia(true);

    let service!: ThemeService;
    expect(() => (service = TestBed.inject(ThemeService))).not.toThrow();
    expect(service.theme()).toBe('light');
  });

  it('✅ فشل localStorage.setItem عند setTheme لا يكسر تحديث الإشارة/الـDOM', () => {
    stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    spyOn(localStorage, 'setItem').and.throwError('QuotaExceededError');

    expect(() => service.setTheme('dark')).not.toThrow();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  // ────────────── وضع «تلقائي» الحي + المظهر الأصلي للمتصفح ──────────────

  /** matchMedia whose result can change after creation, like an OS switching to dark at night. */
  function controllableMatchMedia(initialDark: boolean): { setDark: (v: boolean) => void } {
    let dark = initialDark;
    const listeners: Array<(e: { matches: boolean }) => void> = [];
    spyOn(window, 'matchMedia').and.callFake(() => ({
      get matches() { return dark; },
      media: '',
      onchange: null,
      addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    }) as unknown as MediaQueryList);
    return { setDark: v => { dark = v; listeners.forEach(fn => fn({ matches: v })); } };
  }

  it('✅ بلا اختيار محفوظ: يبقى فاتحاً حتى لو تحوّل الجهاز للداكن', () => {
    const os = controllableMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    expect(service.preference()).toBe('light');

    os.setDark(true);

    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('✅ اختيار «حسب الجهاز»: التطبيق يتبع تغيّر إعداد الجهاز مباشرةً دون إعادة تحميل', () => {
    const os = controllableMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    service.setPreference('system');
    expect(service.theme()).toBe('light');

    os.setDark(true);

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('✅ اختيار المستخدم الصريح لا يُلغى بتغيّر إعداد الجهاز', () => {
    const os = controllableMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    service.setPreference('light');

    os.setDark(true);

    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('✅ setPreference("system") يحفظ «حسب الجهاز» صراحةً ويعود لتتبّع الجهاز', () => {
    const os = controllableMatchMedia(true);
    const service = TestBed.inject(ThemeService);
    service.setPreference('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');

    service.setPreference('system');

    expect(localStorage.getItem(STORAGE_KEY)).toBe('system');
    expect(service.theme()).toBe('dark');
    os.setDark(false);
    expect(service.theme()).toBe('light');
  });

  it('✅ يضبط color-scheme و meta theme-color مع كل تغيير', () => {
    stubMatchMedia(false);
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#000');
    document.head.appendChild(meta);
    const service = TestBed.inject(ThemeService);

    service.setPreference('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(meta.getAttribute('content')).toBe('#0a0a0c');

    service.setPreference('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(meta.getAttribute('content')).toBe('#0F2742');
    meta.remove();
  });

  it('✅ اختيار تم في تبويب آخر (حدث storage) يُطبَّق هنا أيضاً', () => {
    stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);

    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'dark' }));

    expect(service.preference()).toBe('dark');
    expect(service.theme()).toBe('dark');
  });
});
