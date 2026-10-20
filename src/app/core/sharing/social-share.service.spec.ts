import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SocialShareService } from './social-share.service';
import { PropertyShareTrackingService } from './property-share-tracking.service';
import { NativeShareProvider } from './providers/native-share.provider';
import { CopyLinkProvider } from './providers/copy-link.provider';
import { SharePlatform, ShareResult } from './share.model';
import { Property } from '../models/property.model';
import { environment } from '../../../environments/environment';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    title: 'شقة للبيع',
    city: 'دمشق',
    isPublished: true,
    ...overrides
  } as Property;
}

/** The providers open links through an anchor click (see external-link.ts); record the hrefs instead of navigating. */
function captureOpenedLinks(): string[] {
  const opened: string[] = [];
  spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
    opened.push(this.getAttribute('href') ?? '');
  });
  return opened;
}

describe('SocialShareService', () => {
  let service: SocialShareService;
  let tracking: jasmine.SpyObj<PropertyShareTrackingService>;

  beforeEach(() => {
    tracking = jasmine.createSpyObj('PropertyShareTrackingService', ['recordSuccess']);

    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: PropertyShareTrackingService, useValue: tracking }]
    });

    service = TestBed.inject(SocialShareService);
    (environment as { siteUrl: string }).siteUrl = 'https://hudhudnest.com';
    // Modern Chrome (incl. this suite's headless build) ships a real navigator.share, so a
    // plain `delete` cannot be relied on to remove it — shadow it with an own, configurable
    // property instead. See the identical helper in native-share.provider.spec.ts.
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
  });

  afterEach(() => {
    delete (navigator as unknown as { share?: unknown }).share;
  });

  it('returns no providers for an unpublished property (share must be fully hidden/disabled)', () => {
    expect(service.getAvailableProviders(makeProperty({ isPublished: false }))).toEqual([]);
    expect(service.canShare(makeProperty({ isPublished: false }))).toBeFalse();
  });

  it('excludes NativeShareProvider when navigator.share is unsupported', () => {
    const providers = service.getAvailableProviders(makeProperty());
    expect(providers.some(p => p.platform === SharePlatform.Native)).toBeFalse();
  });

  it('includes NativeShareProvider when navigator.share is supported', () => {
    Object.defineProperty(navigator, 'share', {
      value: () => Promise.resolve(),
      configurable: true,
      writable: true
    });

    const providers = service.getAvailableProviders(makeProperty());
    expect(providers.some(p => p.platform === SharePlatform.Native)).toBeTrue();
  });

  it('always includes CopyLink, WhatsApp, Telegram and Facebook (URL-opener based, always available)', () => {
    const platforms = service.getAvailableProviders(makeProperty()).map(p => p.platform);
    expect(platforms).toContain(SharePlatform.CopyLink);
    expect(platforms).toContain(SharePlatform.WhatsApp);
    expect(platforms).toContain(SharePlatform.Telegram);
    expect(platforms).toContain(SharePlatform.Facebook);
  });

  it('records a tracking event only after a successful share, with the platform-attributed UTM context', async () => {
    const copyLink = TestBed.inject(CopyLinkProvider);
    spyOn(copyLink, 'share').and.resolveTo({ success: true, platform: SharePlatform.CopyLink });

    const result = await service.shareVia(makeProperty(), copyLink);

    expect(result.success).toBeTrue();
    expect(tracking.recordSuccess).toHaveBeenCalledWith('p1', SharePlatform.CopyLink, {
      source: 'copy_link',
      medium: 'referral',
      campaign: 'property_share',
      content: 'property_p1'
    });
  });

  it('does NOT record a tracking event when the share fails', async () => {
    const copyLink = TestBed.inject(CopyLinkProvider);
    spyOn(copyLink, 'share').and.resolveTo({
      success: false,
      platform: SharePlatform.CopyLink,
      errorCode: 'CLIPBOARD_FAILED'
    });

    await service.shareVia(makeProperty(), copyLink);

    expect(tracking.recordSuccess).not.toHaveBeenCalled();
  });

  it('does NOT record a tracking event when the user cancels a native share', async () => {
    const native = TestBed.inject(NativeShareProvider);
    const cancelledResult: ShareResult = { success: false, platform: SharePlatform.Native, cancelled: true };
    spyOn(native, 'share').and.resolveTo(cancelledResult);

    await service.shareVia(makeProperty(), native);

    expect(tracking.recordSuccess).not.toHaveBeenCalled();
  });

  it('refuses to share (and never calls the provider) when the property is not shareable', async () => {
    const copyLink = TestBed.inject(CopyLinkProvider);
    const shareSpy = spyOn(copyLink, 'share');

    const result = await service.shareVia(makeProperty({ isPublished: false }), copyLink);

    expect(result.success).toBeFalse();
    expect(result.errorCode).toBe('NOT_SHAREABLE');
    expect(shareSpy).not.toHaveBeenCalled();
    expect(tracking.recordSuccess).not.toHaveBeenCalled();
  });

  it('shareToWhatsApp / shareToTelegram / shareToFacebook / copyPropertyLink dispatch to the right provider', async () => {
    const property = makeProperty();
    captureOpenedLinks();
    const writeTextSpy = jasmine.createSpy('writeText').and.resolveTo(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextSpy }, configurable: true });

    expect((await service.shareToWhatsApp(property)).platform).toBe(SharePlatform.WhatsApp);
    expect((await service.shareToTelegram(property)).platform).toBe(SharePlatform.Telegram);
    expect((await service.shareToFacebook(property)).platform).toBe(SharePlatform.Facebook);
    expect((await service.copyPropertyLink(property)).platform).toBe(SharePlatform.CopyLink);
  });

  // ── UTM / Attribution (Phase 2) ─────────────────────────────────────────

  it('shares the platform-attributed URL, not the plain canonical URL, to Facebook', async () => {
    const opened = captureOpenedLinks();

    await service.shareToFacebook(makeProperty());

    const openedUrl = decodeURIComponent(opened[opened.length - 1]);
    expect(openedUrl).toContain('u=https://hudhudnest.com/properties/p1?utm_source=facebook');
    expect(openedUrl).toContain('utm_medium=social');
    expect(openedUrl).toContain('utm_campaign=property_share');
    expect(openedUrl).toContain('utm_content=property_p1');
  });

  it('embeds the WhatsApp-attributed URL (utm_source=whatsapp) in the WhatsApp message text', async () => {
    const opened = captureOpenedLinks();

    await service.shareToWhatsApp(makeProperty());

    const openedUrl = decodeURIComponent(opened[opened.length - 1]);
    expect(openedUrl).toContain('utm_source=whatsapp');
    expect(openedUrl).not.toContain('utm_source=facebook');
  });

  it('copies the attributed link (utm_source=copy_link), not the bare canonical link', async () => {
    const writeTextSpy = jasmine.createSpy('writeText').and.resolveTo(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextSpy }, configurable: true });

    await service.copyPropertyLink(makeProperty());

    const copied = String(writeTextSpy.calls.mostRecent().args[0]);
    expect(copied).toContain('https://hudhudnest.com/properties/p1?utm_source=copy_link');
    expect(copied).toContain('utm_medium=referral');
  });

  it('never attaches UTM parameters when the property is not shareable (no provider call at all)', async () => {
    const opened = captureOpenedLinks();

    const result = await service.shareToFacebook(makeProperty({ isPublished: false }));

    expect(result.errorCode).toBe('NOT_SHAREABLE');
    expect(opened.length).toBe(0);
  });

  it('offers e-mail between the named apps and the device sheet, and keeps copy-link last', () => {
    const platforms = service.getAvailableProviders(makeProperty()).map(p => p.labelKey);
    expect(platforms).toContain('SHARE.EMAIL');
    expect(platforms[platforms.length - 1]).toBe('SHARE.COPY_LINK');
  });

  it('getCopyLinkUrl is the public, attributed link and null for an unshareable listing', () => {
    expect(service.getCopyLinkUrl(makeProperty())).toContain('https://hudhudnest.com/properties/p1');
    expect(service.getCopyLinkUrl(makeProperty())).toContain('utm_source=copy_link');
    expect(service.getCopyLinkUrl(makeProperty({ isPublished: false }))).toBeNull();
  });

  it('getPreview exposes only public facts', () => {
    const preview = service.getPreview(makeProperty({ ownerName: 'سر', purchasePrice: 5000, currencyCode: 'USD' } as Partial<Property>))!;
    expect(preview.title).toBe('شقة للبيع');
    expect(JSON.stringify(preview)).not.toContain('سر');
    expect(service.getPreview(makeProperty({ isPublished: false }))).toBeNull();
  });
});
