import { TestBed } from '@angular/core/testing';
import { CopyLinkProvider } from './copy-link.provider';
import { ShareableContent, SharePlatform } from '../share.model';

const content: ShareableContent = {
  title: 'شقة للبيع',
  text: 'شقة للبيع\nhttps://hudhudnest.com/properties/1',
  url: 'https://hudhudnest.com/properties/1'
};

describe('CopyLinkProvider', () => {
  let provider: CopyLinkProvider;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    provider = TestBed.inject(CopyLinkProvider);
  });

  it('declares the CopyLink platform', () => {
    expect(provider.platform).toBe(SharePlatform.CopyLink);
  });

  it('copies only the canonical URL via the Clipboard API on success', async () => {
    const writeTextSpy = jasmine.createSpy('writeText').and.resolveTo(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextSpy }, configurable: true });

    const result = await provider.share(content);

    expect(writeTextSpy).toHaveBeenCalledWith(content.url);
    expect(writeTextSpy).not.toHaveBeenCalledWith(content.text);
    expect(result.success).toBeTrue();
    expect(result.message).toBe('SHARE.COPY_LINK_SUCCESS');
  });

  it('falls back to execCommand when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const execSpy = spyOn(document, 'execCommand').and.returnValue(true);

    const result = await provider.share(content);

    expect(execSpy).toHaveBeenCalledWith('copy');
    expect(result.success).toBeTrue();
  });

  it('reports a clear failure when both the Clipboard API and the fallback fail', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    spyOn(document, 'execCommand').and.returnValue(false);

    const result = await provider.share(content);

    expect(result.success).toBeFalse();
    expect(result.message).toBe('SHARE.COPY_LINK_ERROR');
  });

  it('falls back to execCommand when the Clipboard API rejects (e.g. permission denied)', async () => {
    const writeTextSpy = jasmine.createSpy('writeText').and.rejectWith(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextSpy }, configurable: true });
    const execSpy = spyOn(document, 'execCommand').and.returnValue(true);

    const result = await provider.share(content);

    expect(execSpy).toHaveBeenCalledWith('copy');
    expect(result.success).toBeTrue();
  });
});
