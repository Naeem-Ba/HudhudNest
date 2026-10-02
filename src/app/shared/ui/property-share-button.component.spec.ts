import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PropertyShareButtonComponent } from './property-share-button.component';
import { SocialShareService } from '../../core/sharing/social-share.service';
import { ShareProvider, ShareResult, SharePlatform } from '../../core/sharing/share.model';
import { Property } from '../../core/models/property.model';
import { ToastService } from '../services/toast.service';
import { OverlayBackHandlerService } from '../../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../../core/services/scroll-lock.service';

function makeProperty(overrides: Partial<Property> = {}): Property {
  return { id: 'p1', title: 'شقة للبيع', city: 'دمشق', isPublished: true, ...overrides } as Property;
}

function makeProvider(platform: SharePlatform, result: Partial<ShareResult> = {}): ShareProvider {
  return {
    platform,
    labelKey: `SHARE.${platform}`,
    isAvailable: () => true,
    share: async () => ({ success: true, platform, ...result })
  };
}

describe('PropertyShareButtonComponent', () => {
  let fixture: ComponentFixture<PropertyShareButtonComponent>;
  let component: PropertyShareButtonComponent;
  let socialShare: jasmine.SpyObj<SocialShareService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    socialShare = jasmine.createSpyObj('SocialShareService', ['getAvailableProviders', 'shareVia']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);

    TestBed.configureTestingModule({
      imports: [PropertyShareButtonComponent, TranslateModule.forRoot()],
      providers: [
        { provide: SocialShareService, useValue: socialShare },
        { provide: ToastService, useValue: toast }
      ]
    });

    fixture = TestBed.createComponent(PropertyShareButtonComponent);
    component = fixture.componentInstance;
  });

  function setProperty(property: Property, providers: ShareProvider[]) {
    socialShare.getAvailableProviders.and.returnValue(providers);
    component.property = property;
    component.ngOnChanges();
    fixture.detectChanges();
  }

  it('shows the trigger button for a published property with at least one available provider', () => {
    setProperty(makeProperty(), [makeProvider(SharePlatform.CopyLink)]);

    const button = fixture.nativeElement.querySelector('.share-trigger');
    expect(button).not.toBeNull();
  });

  it('hides the trigger button when there are no available providers (e.g. unpublished property)', () => {
    setProperty(makeProperty({ isPublished: false }), []);

    const button = fixture.nativeElement.querySelector('.share-trigger');
    expect(button).toBeNull();
  });

  it('opens the share sheet when the trigger is clicked', () => {
    setProperty(makeProperty(), [makeProvider(SharePlatform.CopyLink)]);

    component.open();
    fixture.detectChanges();

    expect(component.sheetOpen()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.share-sheet')).not.toBeNull();
  });

  it('closes the sheet on Escape', () => {
    setProperty(makeProperty(), [makeProvider(SharePlatform.CopyLink)]);
    component.open();

    component.onEscapeKey();

    expect(component.sheetOpen()).toBeFalse();
  });

  it('calls SocialShareService.shareVia with the chosen provider', async () => {
    const provider = makeProvider(SharePlatform.WhatsApp);
    setProperty(makeProperty(), [provider]);
    socialShare.shareVia.and.resolveTo({ success: true, platform: SharePlatform.WhatsApp });
    component.open();

    await component.choose(provider);

    expect(socialShare.shareVia).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'p1' }), provider);
  });

  it('shows a success toast and closes the sheet on a successful copy-link', async () => {
    const provider = makeProvider(SharePlatform.CopyLink);
    setProperty(makeProperty(), [provider]);
    socialShare.shareVia.and.resolveTo({
      success: true,
      platform: SharePlatform.CopyLink,
      message: 'SHARE.COPY_LINK_SUCCESS'
    });
    component.open();

    await component.choose(provider);

    expect(toast.success).toHaveBeenCalled();
    expect(component.sheetOpen()).toBeFalse();
  });

  it('shows an error toast (and keeps the sheet open) on failure', async () => {
    const provider = makeProvider(SharePlatform.Facebook);
    setProperty(makeProperty(), [provider]);
    socialShare.shareVia.and.resolveTo({
      success: false,
      platform: SharePlatform.Facebook,
      errorCode: 'POPUP_BLOCKED',
      message: 'SHARE.ERROR_POPUP_BLOCKED'
    });
    component.open();

    await component.choose(provider);

    expect(toast.error).toHaveBeenCalled();
    expect(component.sheetOpen()).toBeTrue();
  });

  it('shows no toast at all when the user cancels a native share', async () => {
    const provider = makeProvider(SharePlatform.Native);
    setProperty(makeProperty(), [provider]);
    socialShare.shareVia.and.resolveTo({ success: false, platform: SharePlatform.Native, cancelled: true });
    component.open();

    await component.choose(provider);

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('ignores a second choose() call while the first is still in flight (no double-submit)', async () => {
    const provider = makeProvider(SharePlatform.CopyLink);
    setProperty(makeProperty(), [provider]);

    let resolveShare!: (result: ShareResult) => void;
    socialShare.shareVia.and.returnValue(new Promise<ShareResult>(resolve => { resolveShare = resolve; }));
    component.open();

    const first = component.choose(provider);
    const second = component.choose(provider);

    resolveShare({ success: true, platform: SharePlatform.CopyLink });
    await Promise.all([first, second]);

    expect(socialShare.shareVia).toHaveBeenCalledTimes(1);
  });
});


describe('PropertyShareButtonComponent overlay behaviour', () => {
  it('locks page scroll while the sheet is open and lets Back close it', () => {
    const socialShare = jasmine.createSpyObj<SocialShareService>('SocialShareService', ['getAvailableProviders', 'shareVia']);
    socialShare.getAvailableProviders.and.returnValue([makeProvider(SharePlatform.CopyLink)]);
    const scrollLock = jasmine.createSpyObj<ScrollLockService>('ScrollLockService', ['lock', 'unlock']);

    TestBed.configureTestingModule({
      imports: [PropertyShareButtonComponent, TranslateModule.forRoot()],
      providers: [
        { provide: SocialShareService, useValue: socialShare },
        { provide: ScrollLockService, useValue: scrollLock },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) }
      ]
    });

    const fixture = TestBed.createComponent(PropertyShareButtonComponent);
    fixture.componentInstance.property = makeProperty();
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();

    fixture.componentInstance.open();
    expect(scrollLock.lock).toHaveBeenCalledTimes(1);

    expect(TestBed.inject(OverlayBackHandlerService).closeTopOverlay()).toBeTrue();
    expect(fixture.componentInstance.sheetOpen()).toBeFalse();
    expect(scrollLock.unlock).toHaveBeenCalledTimes(1);

    // Nothing left to consume Back once the sheet is closed.
    expect(TestBed.inject(OverlayBackHandlerService).closeTopOverlay()).toBeFalse();
  });
});
