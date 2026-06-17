// =====================================================================
// âœ… Unit Tests â€“ token-storage.service.spec.ts
// ØªØºØ·ÙŠØ©: ØªØ®Ø²ÙŠÙ† Ø§Ù„ØªÙˆÙƒÙ†ØŒ Ù‚Ø±Ø§Ø¡ØªÙ‡ØŒ ÙˆÙ…Ø³Ø­Ù‡
// =====================================================================
import { TestBed } from '@angular/core/testing';
import { TokenStorageService } from './token-storage.service';

describe('TokenStorageService', () => {
  let service: TokenStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TokenStorageService);

    // ØªÙ†Ø¸ÙŠÙ Ø£ÙŠ Ø¨ÙŠØ§Ù†Ø§Øª Ù‚Ø¯ÙŠÙ…Ø©
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Ø§Ù„Ø£Ù…Ø§Ù† â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('âœ… ÙŠØ¬Ø¨ ØªØ®Ø²ÙŠÙ† accessToken ÙÙŠ Ø§Ù„Ø°Ø§ÙƒØ±Ø© ÙÙ‚Ø· â€“ Ù„Ø§ localStorage', () => {
    service.storeTokens({ accessToken: 'test-token-123' });

    expect(service.getAccessToken()).toBe('test-token-123');
    // âœ… Ø§Ù„Ø£Ù‡Ù…: Ø§Ù„ØªÙˆÙƒÙ† Ù„Ø§ ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† ÙÙŠ localStorage
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('âœ… ÙŠØ¬Ø¨ ØªØ®Ø²ÙŠÙ† accessToken ÙÙŠ Ø§Ù„Ø°Ø§ÙƒØ±Ø© ÙÙ‚Ø· â€“ Ù„Ø§ sessionStorage', () => {
    service.storeTokens({ accessToken: 'test-token-123' });

    expect(service.getAccessToken()).toBe('test-token-123');
    // âœ… accessToken Ù„Ø§ ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† ÙÙŠ sessionStorage (refreshToken ÙÙ‚Ø· Ù…Ø³Ù…ÙˆØ­)
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
  });

  it('âœ… ÙŠØ¬Ø¨ ØªØ®Ø²ÙŠÙ† refreshToken ÙÙŠ sessionStorage ÙÙ‚Ø·', () => {
    service.storeTokens({ accessToken: 'access', refreshToken: 'refresh-xyz' });

    expect(service.getRefreshToken()).toBe('refresh-xyz');
    // âœ… refreshToken ÙÙŠ sessionStorage (ÙˆÙ„ÙŠØ³ localStorage)
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Ø§Ù„Ù‚Ø±Ø§Ø¡Ø© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('âœ… getAccessToken ÙŠÙØ±Ø¬Ø¹ null Ø¥Ø°Ø§ Ù„Ù… ÙŠÙØ®Ø²ÙŽÙ‘Ù† ØªÙˆÙƒÙ†', () => {
    expect(service.getAccessToken()).toBeNull();
  });

  it('âœ… getRefreshToken ÙŠÙØ±Ø¬Ø¹ null Ø¥Ø°Ø§ Ù„Ù… ÙŠÙØ®Ø²ÙŽÙ‘Ù† ØªÙˆÙƒÙ†', () => {
    expect(service.getRefreshToken()).toBeNull();
  });

  it('âœ… ÙŠÙØ±Ø¬Ø¹ null Ø¥Ø°Ø§ Ù…ÙØ±ÙÙ‘Ø± storeTokens Ø¨Ø¯ÙˆÙ† accessToken', () => {
    service.storeTokens({} as any);
    expect(service.getAccessToken()).toBeNull();
  });

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Ø§Ù„Ù…Ø³Ø­ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('âœ… clear() ÙŠÙ…Ø³Ø­ accessToken Ù…Ù† Ø§Ù„Ø°Ø§ÙƒØ±Ø©', () => {
    service.storeTokens({ accessToken: 'token', refreshToken: 'refresh' });
    service.clear();

    expect(service.getAccessToken()).toBeNull();
    expect(service.getRefreshToken()).toBeNull();
  });

  it('âœ… clear() ÙŠÙ…Ø³Ø­ Ø£ÙŠ Ø¨ÙŠØ§Ù†Ø§Øª Ù‚Ø¯ÙŠÙ…Ø© Ù…Ù† localStorage', () => {
    localStorage.setItem('accessToken', 'old-token');
    localStorage.setItem('token', 'old-token');
    localStorage.setItem('refreshToken', 'old-refresh');

    service.clear();

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});
