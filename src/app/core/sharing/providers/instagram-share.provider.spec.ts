import { TestBed } from '@angular/core/testing';
import { InstagramShareProvider } from './instagram-share.provider';
import { ShareableContent, SharePlatform } from '../share.model';

const content: ShareableContent = {
  title: 'شقة للبيع',
  text: 'شقة للبيع\nhttps://realestateworld.world/properties/1',
  url: 'https://realestateworld.world/properties/1'
};

// See the identical helper/comment in native-share.provider.spec.ts — modern Chrome (incl. the
// headless build this suite runs in) ships a real navigator.share, so plain `delete` cannot be
// relied on to remove it.
function setNativeShare(value: unknown): void {
  Object.defineProperty(navigator, 'share', { value, configurable: true, writable: true });
}

function restoreNativeShare(): void {
  delete (navigator as unknown as { share?: unknown }).share;
}

describe('InstagramShareProvider', () => {
  let provider: InstagramShareProvider;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    provider = TestBed.inject(InstagramShareProvider);
  });

  afterEach(() => restoreNativeShare());

  it('is only available when the native share sheet is available (no official web API exists)', () => {
    setNativeShare(undefined);
    expect(provider.isAvailable()).toBeFalse();

    setNativeShare(() => Promise.resolve());
    expect(provider.isAvailable()).toBeTrue();
  });

  it('delegates to the native share sheet and never claims to publish to Instagram directly', async () => {
    const shareSpy = jasmine.createSpy('share').and.resolveTo(undefined);
    setNativeShare(shareSpy);

    const result = await provider.share(content);

    expect(shareSpy).toHaveBeenCalled();
    expect(result.success).toBeTrue();
    // Tracked as "Other", not as a fabricated "posted to Instagram" outcome.
    expect(result.platform).toBe(SharePlatform.Other);
  });

  it('reports NOT_SUPPORTED (via delegation) when native share is unavailable', async () => {
    setNativeShare(undefined);

    const result = await provider.share(content);

    expect(result.success).toBeFalse();
    expect(result.errorCode).toBe('NOT_SUPPORTED');
  });
});
