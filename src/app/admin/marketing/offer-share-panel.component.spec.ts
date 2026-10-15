import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { OfferSharePanelComponent } from './offer-share-panel.component';
import { AdminOfferDto } from '../../core/api/admin-marketing.service';
import { OfferShareService } from '../../core/sharing/offer-share.service';
import { ShareProvider, SharePlatform } from '../../core/sharing/share.model';

function offer(over: Partial<AdminOfferDto> = {}): AdminOfferDto {
  return {
    id: 'o-1', name: 'عرض', description: null, discountType: 'Percentage', discountValue: 20,
    targetPlanTier: null, startsAtUtc: '2026-10-01T00:00:00Z', endsAtUtc: null, maxRedemptions: null,
    redeemedCount: 0, status: 'Active', terms: null, createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z', isPubliclyVisible: true, ...over,
  };
}

describe('OfferSharePanelComponent', () => {
  const whatsapp: ShareProvider = {
    platform: SharePlatform.WhatsApp, labelKey: 'SHARE.WHATSAPP', isAvailable: () => true,
    share: async () => ({ success: true, platform: SharePlatform.WhatsApp }),
  };
  let service: jasmine.SpyObj<OfferShareService>;

  async function create(o: AdminOfferDto) {
    TestBed.configureTestingModule({
      imports: [OfferSharePanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: OfferShareService, useValue: service }],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      OFFER_SHARE: {
        DIALOG_OPENED: 'The share dialog was opened. Nothing has been published yet.',
        NOT_VISIBLE: 'not visible', HONESTY: 'honesty', TITLE: 'title', CLOSE: 'close', COPY_TEXT: 'copy',
      },
    });
    translate.use('en');
    const fixture = TestBed.createComponent(OfferSharePanelComponent);
    (fixture.componentRef as ComponentRef<OfferSharePanelComponent>).setInput('offer', o);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('OfferShareService', ['canShare', 'getAvailableProviders', 'buildContent', 'shareVia']);
    service.canShare.and.callFake(o => !!o?.isPubliclyVisible);
    service.getAvailableProviders.and.returnValue([whatsapp]);
    service.buildContent.and.resolveTo({ title: 'عرض', text: 'نص المنشور', url: 'https://hudhudnest.com/landing' });
  });

  it('refuses to prepare a post for an offer visitors cannot see (no preview, no channels)', async () => {
    const fixture = await create(offer({ status: 'Draft', isPubliclyVisible: false }));

    expect(fixture.nativeElement.textContent).toContain('not visible');
    expect(fixture.nativeElement.querySelector('.share-preview')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.share-panel__actions button').length).toBe(0);
    expect(service.buildContent).not.toHaveBeenCalled();
  });

  it('shows the preview, and after a channel click says only that the dialog was opened — never "published"', async () => {
    service.shareVia.and.resolveTo({ success: true, platform: SharePlatform.WhatsApp });
    const fixture = await create(offer());

    expect(fixture.nativeElement.querySelector('.share-preview').textContent).toContain('نص المنشور');

    await fixture.componentInstance.shareVia(whatsapp);
    fixture.detectChanges();

    const notice = fixture.nativeElement.querySelector('.share-panel__notice').textContent;
    expect(notice).toContain('dialog was opened');
    expect(notice).toContain('Nothing has been published');
    expect(notice.toLowerCase()).not.toContain('published successfully');
  });

  it('a dismissed native share sheet is not an error', async () => {
    service.shareVia.and.resolveTo({ success: false, cancelled: true, platform: SharePlatform.Native });
    const fixture = await create(offer());

    await fixture.componentInstance.shareVia(whatsapp);

    expect(fixture.componentInstance.notice()).toBeNull();
  });

  it('a failed channel (e.g. blocked popup) shows an error, not success', async () => {
    service.shareVia.and.resolveTo({ success: false, platform: SharePlatform.WhatsApp, message: 'SHARE.ERROR_POPUP_BLOCKED' });
    const fixture = await create(offer());

    await fixture.componentInstance.shareVia(whatsapp);

    expect(fixture.componentInstance.notice()).toEqual({ kind: 'error', key: 'SHARE.ERROR_POPUP_BLOCKED' });
  });
});
