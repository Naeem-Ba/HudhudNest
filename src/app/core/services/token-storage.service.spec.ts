// =====================================================================
// ✅ Unit Tests – token-storage.service.spec.ts
// تغطية: تخزين التوكن، قراءته، ومسحه
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
    // ✅ accessToken لا يجب أن يكون في sessionStorage (refreshToken فقط مسموح)
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
  });

  it('✅ يجب تخزين refreshToken في sessionStorage فقط', () => {
    service.storeTokens({ accessToken: 'access', refreshToken: 'refresh-xyz' });

    expect(service.getRefreshToken()).toBe('refresh-xyz');
    // ✅ refreshToken في sessionStorage (وليس localStorage)
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  // ────────────── القراءة ──────────────

  it('✅ getAccessToken يُرجع null إذا لم يُخزَّن توكن', () => {
    expect(service.getAccessToken()).toBeNull();
  });

  it('✅ getRefreshToken يُرجع null إذا لم يُخزَّن توكن', () => {
    expect(service.getRefreshToken()).toBeNull();
  });

  it('✅ يُرجع null إذا مُرّر storeTokens بدون accessToken', () => {
    service.storeTokens({} as any);
    expect(service.getAccessToken()).toBeNull();
  });

  // ────────────── المسح ──────────────

  it('✅ clear() يمسح accessToken من الذاكرة', () => {
    service.storeTokens({ accessToken: 'token', refreshToken: 'refresh' });
    service.clear();

    expect(service.getAccessToken()).toBeNull();
    expect(service.getRefreshToken()).toBeNull();
  });

  it('✅ clear() يمسح أي بيانات قديمة من localStorage', () => {
    localStorage.setItem('accessToken', 'old-token');
    localStorage.setItem('token', 'old-token');
    localStorage.setItem('refreshToken', 'old-refresh');

    service.clear();

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});
