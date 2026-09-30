import { TestBed } from '@angular/core/testing';
import { TelegramShareProvider } from './telegram-share.provider';
import { ShareableContent, SharePlatform } from '../share.model';

const content: ShareableContent = {
  title: 'شقة للبيع في طرطوس',
  text: 'شقة للبيع في طرطوس\n120 م² • 3 غرف\nhttps://hudhudnest.com/properties/1',
  url: 'https://hudhudnest.com/properties/1'
};

describe('TelegramShareProvider', () => {
  let provider: TelegramShareProvider;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    provider = TestBed.inject(TelegramShareProvider);
  });

  it('declares the Telegram platform', () => {
    expect(provider.platform).toBe(SharePlatform.Telegram);
  });

  it('opens the official t.me share widget with url and text as separate encoded params', async () => {
    const openSpy = spyOn(window, 'open').and.returnValue({} as Window);

    const result = await provider.share(content);

    expect(openSpy).toHaveBeenCalledWith(
      `https://t.me/share/url?url=${encodeURIComponent(content.url)}&text=${encodeURIComponent(content.title)}`,
      '_blank',
      'noopener,noreferrer'
    );
    expect(result.success).toBeTrue();
  });

  it('reports a failure result when the popup is blocked', async () => {
    spyOn(window, 'open').and.returnValue(null);

    const result = await provider.share(content);

    expect(result.success).toBeFalse();
    expect(result.errorCode).toBe('POPUP_BLOCKED');
  });
});
