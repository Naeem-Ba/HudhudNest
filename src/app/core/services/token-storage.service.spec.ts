// =====================================================================
// ✅ Unit Tests – token-storage.service.spec.ts
// تغطية: تخزين accessToken وقراءته ومسحه.
// RELEASE-BLOCKERS-AR.md B-13: لم يعد لهذه الخدمة أي علم برمز التجديد على
// الإطلاق — يعيش الآن فقط في كعكة HttpOnly لا تراها JavaScript، لا في
// sessionStorage كما كان سابقاً. هذا الملف يتحقق أن التخزين المحلي يبقى
// خالياً من أي أثر له.
// =====================================================================
import { TestBed } from '@angular/core/testing';
import { TokenStorageService } from './token-storage.service';

describe('TokenStorageService', () => {
  let service: TokenStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TokenStorageService);

    // تنظيف أي بيانات قديمة
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // ────────────── الأمان ──────────────

  it('✅ يجب تخزين accessToken في الذاكرة فقط – لا localStorage', () => {
    service.storeTokens({ accessToken: 'test-token-123' });

    expect(service.getAccessToken()).toBe('test-token-123');
    // ✅ الأهم: التوكن لا يجب أن يكون في localStorage
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('✅ يجب تخزين accessToken في الذاكرة فقط – لا sessionStorage', () => {
    service.storeTokens({ accessToken: 'test-token-123' });

    expect(service.getAccessToken()).toBe('test-token-123');
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
  });

  it('✅ B-13: استدعاء storeTokens لا يكتب أي شيء متعلق برمز التجديد في أي تخزين', () => {
    // حتى لو مرّر مستدعٍ قديم حقل refreshToken ضمن الاستجابة، فالخدمة لم تعد
    // تعرف عنه إطلاقاً — لا يوجد أي مكان محلي يمكن أن يُكتب فيه.
    service.storeTokens({ accessToken: 'access', ...( { refreshToken: 'refresh-xyz' } as object) });

    expect(sessionStorage.getItem('wohnungsapp_refresh')).toBeNull();
    expect(localStorage.getItem('wohnungsapp_refresh')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  // ────────────── القراءة ──────────────

  it('✅ getAccessToken يُرجع null إذا لم يُخزَّن توكن', () => {
    expect(service.getAccessToken()).toBeNull();
  });

  it('✅ يُرجع null إذا مُرّر storeTokens بدون accessToken', () => {
    service.storeTokens({} as any);
    expect(service.getAccessToken()).toBeNull();
  });

  // ────────────── المسح ──────────────

  it('✅ clear() يمسح accessToken من الذاكرة', () => {
    service.storeTokens({ accessToken: 'token' });
    service.clear();

    expect(service.getAccessToken()).toBeNull();
  });

  it('✅ clear() يمسح أي بيانات قديمة من localStorage/sessionStorage (بقايا ما قبل B-13)', () => {
    localStorage.setItem('accessToken', 'old-token');
    localStorage.setItem('token', 'old-token');
    localStorage.setItem('refreshToken', 'old-refresh');
    sessionStorage.setItem('wohnungsapp_refresh', 'old-refresh');
    localStorage.setItem('wohnungsapp_remember', 'true');

    service.clear();

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(sessionStorage.getItem('wohnungsapp_refresh')).toBeNull();
    expect(localStorage.getItem('wohnungsapp_remember')).toBeNull();
  });
});
