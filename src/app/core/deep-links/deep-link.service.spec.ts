import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { resolveDeepLink } from './deep-link-routes';
import { DeepLinkService } from './deep-link.service';

describe('resolveDeepLink', () => {
  it('maps shared listing links to in-app routes and keeps the attribution query', () => {
    expect(resolveDeepLink('https://hudhudnest.com/properties/abc-123')).toBe('/properties/abc-123');
    expect(resolveDeepLink('https://hudhudnest.com/properties/abc-123?utm_source=whatsapp&utm_medium=share#photos')).toBe(
      '/properties/abc-123?utm_source=whatsapp&utm_medium=share#photos'
    );
    expect(resolveDeepLink('https://hudhudnest.com/short-stay/42')).toBe('/short-stay/42');
    expect(resolveDeepLink('https://hudhudnest.com/investments/7')).toBe('/investments/7');
    expect(resolveDeepLink('https://hudhudnest.com/users/9')).toBe('/users/9');
  });

  it('opens the list pages and the legacy /wohnungen links', () => {
    expect(resolveDeepLink('https://hudhudnest.com/properties')).toBe('/properties');
    expect(resolveDeepLink('https://hudhudnest.com/properties/')).toBe('/properties');
    expect(resolveDeepLink('https://hudhudnest.com/wohnungen/abc')).toBe('/wohnungen/abc');
    expect(resolveDeepLink('https://hudhudnest.com/kontakt')).toBe('/kontakt');
  });

  it('maps the bare site address to the home route', () => {
    expect(resolveDeepLink('https://hudhudnest.com')).toBe('/home');
    expect(resolveDeepLink('https://hudhudnest.com/')).toBe('/home');
    expect(resolveDeepLink('https://hudhudnest.com/?utm_source=qr')).toBe('/home?utm_source=qr');
  });

  it('accepts www and any host casing', () => {
    expect(resolveDeepLink('https://www.hudhudnest.com/properties/1')).toBe('/properties/1');
    expect(resolveDeepLink('https://HudhudNest.com/properties/1')).toBe('/properties/1');
  });

  it('ignores other hosts, including look-alikes and credential tricks', () => {
    for (const url of [
      'https://evil.example/properties/1',
      'https://hudhudnest.com.evil.example/properties/1',
      'https://evilhudhudnest.com/properties/1',
      'https://hudhudnest.com@evil.example/properties/1',
      'https://user:pass@hudhudnest.com/properties/1',
      'https://staging--hudhudnest.netlify.app/properties/1'
    ]) {
      expect(resolveDeepLink(url)).withContext(url).toBeNull();
    }
  });

  it('ignores anything that is not https', () => {
    for (const url of [
      'http://hudhudnest.com/properties/1',
      'capacitor://localhost/properties/1',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'intent://hudhudnest.com/properties/1#Intent;scheme=https;end'
    ]) {
      expect(resolveDeepLink(url)).withContext(url).toBeNull();
    }
  });

  it('never opens authentication, admin, payment or owner-only screens', () => {
    for (const path of [
      '/auth/login',
      '/auth/reset-password?token=abc',
      '/admin/users',
      '/checkout/featured/1',
      '/profile',
      '/property-form',
      '/my-listings',
      '/messages/1',
      '/favorites',
      '/properties/edit/1',
      '/properties/edit'
    ]) {
      expect(resolveDeepLink(`https://hudhudnest.com${path}`)).withContext(path).toBeNull();
    }
  });

  it('only matches whole path segments', () => {
    expect(resolveDeepLink('https://hudhudnest.com/properties-evil')).toBeNull();
    expect(resolveDeepLink('https://hudhudnest.com/propertiesx/1')).toBeNull();
    expect(resolveDeepLink('https://hudhudnest.com/properties/editor')).toBe('/properties/editor');
  });

  it('refuses path tricks', () => {
    expect(resolveDeepLink('https://hudhudnest.com//evil.example/properties/1')).toBeNull();
    expect(resolveDeepLink('https://hudhudnest.com/properties/..%2f..%2fauth/login')).toBeNull();
    expect(resolveDeepLink('https://hudhudnest.com/properties/../auth/login')).toBeNull();
    expect(resolveDeepLink('https://hudhudnest.com/properties/..%5cadmin')).toBeNull();
  });

  it('ignores empty and malformed input', () => {
    expect(resolveDeepLink('')).toBeNull();
    expect(resolveDeepLink(null)).toBeNull();
    expect(resolveDeepLink(undefined)).toBeNull();
    expect(resolveDeepLink('not a url')).toBeNull();
  });
});

describe('DeepLinkService', () => {
  let navigateByUrl: jasmine.Spy;
  let service: DeepLinkService;

  beforeEach(() => {
    navigateByUrl = jasmine.createSpy('navigateByUrl').and.resolveTo(true);
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { navigateByUrl } }] });
    service = TestBed.inject(DeepLinkService);
  });

  it('navigates to an allowed link and reports it', () => {
    expect(service.open('https://hudhudnest.com/properties/5?utm_source=telegram')).toBeTrue();
    expect(navigateByUrl).toHaveBeenCalledOnceWith('/properties/5?utm_source=telegram');
  });

  it('does not navigate for a link that is not allowed', () => {
    expect(service.open('https://hudhudnest.com/admin/users')).toBeFalse();
    expect(service.open('https://evil.example/properties/5')).toBeFalse();
    expect(service.open(undefined)).toBeFalse();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('initialize() is a no-op in a browser (no native bridge)', () => {
    expect(() => service.initialize()).not.toThrow();
  });
});
