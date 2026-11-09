import { TestBed } from '@angular/core/testing';
import { EmailShareProvider } from './email-share.provider';
import { ShareableContent, SharePlatform } from '../share.model';

const content: ShareableContent = {
  title: 'شقة & فيلا',
  text: 'شقة & فيلا\nhttps://hudhudnest.com/properties/1',
  url: 'https://hudhudnest.com/properties/1'
};

describe('EmailShareProvider', () => {
  let provider: EmailShareProvider;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    provider = TestBed.inject(EmailShareProvider);
  });

  it('is tracked as Other and always available in a browser', () => {
    expect(provider.platform).toBe(SharePlatform.Other);
    expect(provider.isAvailable()).toBeTrue();
  });

  it('opens a mailto: link whose subject is the title and whose body is the public message', async () => {
    let href = '';
    spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
      href = this.getAttribute('href') ?? '';
    });

    const result = await provider.share(content);

    expect(result.success).toBeTrue();
    expect(href.startsWith('mailto:?subject=')).toBeTrue();
    expect(decodeURIComponent(href.split('subject=')[1].split('&body=')[0])).toBe(content.title);
    expect(decodeURIComponent(href.split('&body=')[1])).toBe(content.text);
  });

  it('reports a failed open once, as OPEN_FAILED', async () => {
    spyOn(HTMLAnchorElement.prototype, 'click').and.throwError('boom');

    const result = await provider.share(content);

    expect(result.success).toBeFalse();
    expect(result.errorCode).toBe('OPEN_FAILED');
    expect(result.message).toBe('SHARE.ERROR_OPEN_FAILED');
  });
});
