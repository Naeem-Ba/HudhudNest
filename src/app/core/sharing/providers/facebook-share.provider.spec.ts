import { TestBed } from '@angular/core/testing';
import { FacebookShareProvider } from './facebook-share.provider';
import { ShareableContent, SharePlatform } from '../share.model';

const content: ShareableContent = {
  title: 'شقة للبيع',
  text: 'شقة للبيع\nhttps://realestateworld.world/properties/1',
  url: 'https://realestateworld.world/properties/1'
};

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

  it('opens the official sharer.php endpoint with the URL-encoded canonical URL', async () => {
    const openSpy = spyOn(window, 'open').and.returnValue({} as Window);

    const result = await provider.share(content);

    expect(openSpy).toHaveBeenCalledWith(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(content.url)}`,
      '_blank',
      'noopener,noreferrer'
    );
    expect(result.success).toBeTrue();
    expect(result.platform).toBe(SharePlatform.Facebook);
  });

  it('reports a failure result when the popup is blocked', async () => {
    spyOn(window, 'open').and.returnValue(null);

    const result = await provider.share(content);

    expect(result.success).toBeFalse();
    expect(result.errorCode).toBe('POPUP_BLOCKED');
    expect(result.message).toBeTruthy();
  });
});
