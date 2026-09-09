import { TestBed } from '@angular/core/testing';
import { WhatsAppShareProvider } from './whatsapp-share.provider';
import { ShareableContent, SharePlatform } from '../share.model';

const content: ShareableContent = {
  title: 'شقة للبيع في طرطوس',
  text: 'شقة للبيع في طرطوس\n120 م² • 3 غرف • 75,000 $\nشاهد الإعلان على عقار تيك:\nhttps://realestateworld.world/properties/1',
  url: 'https://realestateworld.world/properties/1'
};

describe('WhatsAppShareProvider', () => {
  let provider: WhatsAppShareProvider;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    provider = TestBed.inject(WhatsAppShareProvider);
  });

  it('declares the WhatsApp platform', () => {
    expect(provider.platform).toBe(SharePlatform.WhatsApp);
  });

  it('opens wa.me with the full message URL-encoded as `text`', async () => {
    const openSpy = spyOn(window, 'open').and.returnValue({} as Window);

    const result = await provider.share(content);

    expect(openSpy).toHaveBeenCalledWith(
      `https://wa.me/?text=${encodeURIComponent(content.text)}`,
      '_blank',
      'noopener,noreferrer'
    );
    expect(result.success).toBeTrue();
  });

  it('includes the canonical URL inside the encoded text (WhatsApp has no separate url param)', async () => {
    spyOn(window, 'open').and.callFake((url?: string | URL) => {
      expect(decodeURIComponent(String(url))).toContain(content.url);
      return {} as Window;
    });

    await provider.share(content);
  });

  it('reports a failure result when the popup is blocked', async () => {
    spyOn(window, 'open').and.returnValue(null);

    const result = await provider.share(content);

    expect(result.success).toBeFalse();
    expect(result.errorCode).toBe('POPUP_BLOCKED');
  });
});
