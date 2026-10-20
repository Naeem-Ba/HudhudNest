import { TestBed } from '@angular/core/testing';
import { NativeShareProvider } from './native-share.provider';
import { ShareableContent, SharePlatform } from '../share.model';

const content: ShareableContent = {
  title: 'شقة للبيع',
  text: 'شقة للبيع\nhttps://hudhudnest.com/properties/1',
  url: 'https://hudhudnest.com/properties/1'
};

// Modern Chrome (incl. the headless build this suite runs in) ships a REAL, native
// navigator.share — so `delete navigator.share` is not reliable (it's often an own,
// non-configurable property, and `delete` silently no-ops rather than throwing). Shadowing it
// with an own, configurable property via defineProperty works regardless of what the real
// browser provides, and `restoreNativeShare()` removes that shadow afterward so it never
// leaks into another spec file.
function setNativeShare(value: unknown): void {
  Object.defineProperty(navigator, 'share', { value, configurable: true, writable: true });
}

function restoreNativeShare(): void {
  delete (navigator as unknown as { share?: unknown }).share;
}

describe('NativeShareProvider', () => {
  let provider: NativeShareProvider;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    provider = TestBed.inject(NativeShareProvider);
  });

  afterEach(() => restoreNativeShare());

  it('declares the Native platform', () => {
    expect(provider.platform).toBe(SharePlatform.Native);
  });

  it('is unavailable when navigator.share does not exist', () => {
    setNativeShare(undefined);
    expect(provider.isAvailable()).toBeFalse();
  });

  it('is available when navigator.share exists', () => {
    setNativeShare(() => Promise.resolve());
    expect(provider.isAvailable()).toBeTrue();
  });

  it('calls navigator.share with title, text and url, and reports success', async () => {
    const shareSpy = jasmine.createSpy('share').and.resolveTo(undefined);
    setNativeShare(shareSpy);

    const result = await provider.share(content);

    expect(shareSpy).toHaveBeenCalledWith({ title: content.title, text: content.text, url: content.url });
    expect(result.success).toBeTrue();
  });

  it('treats a user-cancelled share (AbortError) as cancelled, not an error', async () => {
    setNativeShare(jasmine.createSpy('share').and.rejectWith(new DOMException('cancelled', 'AbortError')));

    const result = await provider.share(content);

    expect(result.success).toBeFalse();
    expect(result.cancelled).toBeTrue();
    expect(result.errorCode).toBeUndefined();
  });

  it('reports a real failure for any other rejection', async () => {
    setNativeShare(jasmine.createSpy('share').and.rejectWith(new Error('boom')));

    const result = await provider.share(content);

    expect(result.success).toBeFalse();
    expect(result.cancelled).toBeFalsy();
    expect(result.errorCode).toBe('NATIVE_SHARE_FAILED');
  });

  it('reports NOT_SUPPORTED when called despite being unavailable', async () => {
    setNativeShare(undefined);

    const result = await provider.share(content);

    expect(result.success).toBeFalse();
    expect(result.errorCode).toBe('NOT_SUPPORTED');
  });
});
