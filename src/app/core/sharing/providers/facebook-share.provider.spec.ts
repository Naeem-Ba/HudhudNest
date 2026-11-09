import { TestBed } from '@angular/core/testing';
import { FacebookShareProvider } from './facebook-share.provider';
import { ShareableContent, SharePlatform } from '../share.model';

const content: ShareableContent = {
  title: 'شقة للبيع',
  text: 'شقة للبيع\nhttps://hudhudnest.com/properties/1',
  url: 'https://hudhudnest.com/properties/1'
};

/** Captures the link the provider hands over (the anchor click) without navigating anywhere. */
function captureLink(): { href: () => string | null } {
  let href: string | null = null;
  spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
    href = this.href;
  });
  return { href: () => href };
}

describe('FacebookShareProvider', () => {
  let provider: FacebookShareProvider;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    provider = TestBed.inject(FacebookShareProvider);
  });

  it('declares the Facebook platform', () => {
    expect(provider.platform).toBe(SharePlatform.Facebook);
  });

  it('is always available', () => {
    expect(provider.isAvailable()).toBeTrue();
  });
  it('hands the share link over by an anchor click and never trusts window.open', async () => {
    const openSpy = spyOn(window, 'open');
    const link = captureLink();

    const result = await provider.share(content);

    expect(openSpy).not.toHaveBeenCalled();
    expect(link.href()).toContain('facebook.com/sharer');
    expect(decodeURIComponent(link.href() ?? '')).toContain(content.url);
    expect(result.success).toBeTrue();
  });

  it('does NOT report a pop-up failure for a normal share (the old noopener false error)', async () => {
    captureLink();

    const result = await provider.share(content);

    expect(result.success).toBeTrue();
    expect(result.errorCode).toBeUndefined();
    expect(result.message).toBeUndefined();
  });

  it('reports a real failure only when the hand-over itself throws', async () => {
    spyOn(HTMLAnchorElement.prototype, 'click').and.throwError('blocked');

    const result = await provider.share(content);

    expect(result.success).toBeFalse();
    expect(result.errorCode).toBe('OPEN_FAILED');
    expect(result.message).toBe('SHARE.ERROR_OPEN_FAILED');
  });
});
