// =====================================================================
// ✅ Unit Tests – app-update.service.spec.ts
// يغطي: تطبيع رقم الإصدار (حاسم لأن MARKETING_VERSION الحالي على iOS هو "1.0" فقط —
// جزآن، والـ backend's AppVersion.TryParse يرفض أي شيء غير ثلاث قطع بالضبط ويُعيد 422)،
// تخطّي الويب بالكامل، اختيار mandatoryUpdate/optionalUpdate الصحيح حسب استجابة الخادم،
// عدم تعطّل شيء عند فشل الشبكة، وفتح رابط المتجر (أو عدم فعل شيء بلا رابط).
//
// AppUpdateNativeGateway يُموَّه بالكامل عبر useValue (Angular DI) بدل spyOn على
// App/Browser المستوردَين من @capacitor/*: كلاهما كائنات Proxy من registerPlugin()،
// وspyOn لا يعترضها بشكل موثوق (أول محاولة فشلت بصمت — الاستدعاء الحقيقي غير المموَّه
// كان يمر). راجع تعليق app-update-native.gateway.ts لنفس السبب.
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { AppUpdateNativeGateway } from './app-update-native.gateway';
import { AppUpdateCheckDto, AppUpdateService, normalizeAppVersion } from './app-update.service';

function fakeCheckResponse(overrides: Partial<AppUpdateCheckDto> = {}): AppUpdateCheckDto {
  return {
    updateAvailable: false,
    mandatory: false,
    latestVersion: null,
    minimumSupportedVersion: null,
    storeUrl: null,
    releaseNotes: null,
    releaseDate: null,
    ...overrides
  };
}

describe('normalizeAppVersion', () => {
  it('✅ يكمل الأجزاء الناقصة بأصفار — MARKETING_VERSION الحالي على iOS هو "1.0" فقط', () => {
    expect(normalizeAppVersion('1.0')).toBe('1.0.0');
  });

  it('✅ يُبقي الصيغة الصحيحة (major.minor.patch) كما هي', () => {
    expect(normalizeAppVersion('1.2.3')).toBe('1.2.3');
  });

  it('✅ يقتصر على أول ثلاث قطع إن وُجد أكثر', () => {
    expect(normalizeAppVersion('1.2.3.4')).toBe('1.2.3');
  });

  it('✅ قطعة غير رقمية أو مدخل فارغ/مفقود يصبح صفراً بدل رمي خطأ يعطّل الفحص بالكامل', () => {
    expect(normalizeAppVersion('abc')).toBe('0.0.0');
    expect(normalizeAppVersion(null)).toBe('0.0.0');
    expect(normalizeAppVersion(undefined)).toBe('0.0.0');
    expect(normalizeAppVersion('')).toBe('0.0.0');
  });
});

describe('AppUpdateService', () => {
  let service: AppUpdateService;
  let httpMock: HttpTestingController;
  let native: jasmine.SpyObj<AppUpdateNativeGateway>;

  beforeEach(() => {
    native = jasmine.createSpyObj<AppUpdateNativeGateway>('AppUpdateNativeGateway', [
      'isNativePlatform',
      'getPlatform',
      'getAppVersion',
      'openUrl'
    ]);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TranslateService, useValue: { currentLang: 'ar', defaultLang: 'ar' } },
        { provide: AppUpdateNativeGateway, useValue: native }
      ]
    });

    service = TestBed.inject(AppUpdateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('✅ على الويب (isNativePlatform=false): لا يستدعي الـ backend إطلاقاً — لا مفهوم "إصدار مثبَّت" للويب', () => {
    native.isNativePlatform.and.returnValue(false);

    service.initialize();

    expect(native.getAppVersion).not.toHaveBeenCalled();
    httpMock.expectNone(() => true);
  });

  it('✅ على Android: يرسل platform=Android ونسخة versionName كما هي (ثلاث قطع بالفعل)', async () => {
    native.isNativePlatform.and.returnValue(true);
    native.getPlatform.and.returnValue('android');
    native.getAppVersion.and.resolveTo('1.1.0');

    service.initialize();
    await Promise.resolve();
    await Promise.resolve();

    const req = httpMock.expectOne(r => r.url.endsWith('/app-updates/check'));
    expect(req.request.params.get('platform')).toBe('Android');
    expect(req.request.params.get('currentVersion')).toBe('1.1.0');
    req.flush(fakeCheckResponse());
  });

  it('✅ على iOS: MARKETING_VERSION "1.0" يُطبَّع إلى "1.0.0" قبل إرساله (وإلا يرفضه الـ backend بـ 422)', async () => {
    native.isNativePlatform.and.returnValue(true);
    native.getPlatform.and.returnValue('ios');
    native.getAppVersion.and.resolveTo('1.0');

    service.initialize();
    await Promise.resolve();
    await Promise.resolve();

    const req = httpMock.expectOne(r => r.url.endsWith('/app-updates/check'));
    expect(req.request.params.get('platform')).toBe('IOS');
    expect(req.request.params.get('currentVersion')).toBe('1.0.0');
    req.flush(fakeCheckResponse());
  });

  it('✅ mandatory=true يملأ mandatoryUpdate فقط، وليس optionalUpdate', async () => {
    native.isNativePlatform.and.returnValue(true);
    native.getPlatform.and.returnValue('android');
    native.getAppVersion.and.resolveTo('1.0.0');

    service.initialize();
    await Promise.resolve();
    await Promise.resolve();

    httpMock.expectOne(r => r.url.endsWith('/app-updates/check')).flush(
      fakeCheckResponse({
        updateAvailable: true,
        mandatory: true,
        latestVersion: '1.2.0',
        minimumSupportedVersion: '1.1.0',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.realestate.app'
      })
    );

    expect(service.mandatoryUpdate()).not.toBeNull();
    expect(service.optionalUpdate()).toBeNull();
  });

  it('✅ updateAvailable=true بلا mandatory يملأ optionalUpdate فقط', async () => {
    native.isNativePlatform.and.returnValue(true);
    native.getPlatform.and.returnValue('android');
    native.getAppVersion.and.resolveTo('1.0.0');

    service.initialize();
    await Promise.resolve();
    await Promise.resolve();

    httpMock.expectOne(r => r.url.endsWith('/app-updates/check')).flush(
      fakeCheckResponse({ updateAvailable: true, mandatory: false, latestVersion: '1.1.0', minimumSupportedVersion: '1.0.0' })
    );

    expect(service.optionalUpdate()).not.toBeNull();
    expect(service.mandatoryUpdate()).toBeNull();
  });

  it('✅ updateAvailable=false: لا حوار على الإطلاق', async () => {
    native.isNativePlatform.and.returnValue(true);
    native.getPlatform.and.returnValue('android');
    native.getAppVersion.and.resolveTo('1.0.0');

    service.initialize();
    await Promise.resolve();
    await Promise.resolve();

    httpMock.expectOne(r => r.url.endsWith('/app-updates/check')).flush(fakeCheckResponse());

    expect(service.mandatoryUpdate()).toBeNull();
    expect(service.optionalUpdate()).toBeNull();
  });

  it('✅ فشل الشبكة/الخادم يُبتلع بصمت — لا يرمي، لا يعرض أي حوار', async () => {
    native.isNativePlatform.and.returnValue(true);
    native.getPlatform.and.returnValue('android');
    native.getAppVersion.and.resolveTo('1.0.0');

    service.initialize();
    await Promise.resolve();
    await Promise.resolve();

    httpMock.expectOne(r => r.url.endsWith('/app-updates/check'))
      .error(new ProgressEvent('network error'));
    await Promise.resolve();

    expect(service.mandatoryUpdate()).toBeNull();
    expect(service.optionalUpdate()).toBeNull();
  });

  it('✅ فشل قراءة رقم الإصدار الأصلي نفسه (getAppVersion يرفض) يُبتلع أيضاً — لا HTTP، لا خطأ', async () => {
    native.isNativePlatform.and.returnValue(true);
    native.getPlatform.and.returnValue('android');
    native.getAppVersion.and.rejectWith(new Error('native bridge unavailable'));

    service.initialize();
    await Promise.resolve();
    await Promise.resolve();

    httpMock.expectNone(() => true);
    expect(service.mandatoryUpdate()).toBeNull();
    expect(service.optionalUpdate()).toBeNull();
  });

  it('✅ استدعاء initialize() أكثر من مرة في نفس الإقلاع لا يكرر الطلب', async () => {
    native.isNativePlatform.and.returnValue(true);
    native.getPlatform.and.returnValue('android');
    native.getAppVersion.and.resolveTo('1.0.0');

    service.initialize();
    service.initialize();
    await Promise.resolve();
    await Promise.resolve();

    httpMock.expectOne(r => r.url.endsWith('/app-updates/check')).flush(fakeCheckResponse());
    expect(native.getAppVersion).toHaveBeenCalledTimes(1);
  });

  it('✅ dismissOptionalUpdate() يُفرغ optionalUpdate فقط — بلا تخزين دائم، يعود عند إعادة الإقلاع', () => {
    service.optionalUpdate.set(fakeCheckResponse({ updateAvailable: true }));

    service.dismissOptionalUpdate();

    expect(service.optionalUpdate()).toBeNull();
  });

  it('✅ openStore بلا storeUrl: لا يفعل شيئاً، لا يرمي خطأ', async () => {
    await service.openStore(null);

    expect(native.openUrl).not.toHaveBeenCalled();
  });

  it('✅ openStore مع storeUrl: يفتح المتجر عبر البوابة', async () => {
    native.openUrl.and.resolveTo();
    const storeUrl = 'https://play.google.com/store/apps/details?id=com.realestate.app';

    await service.openStore(storeUrl);

    expect(native.openUrl).toHaveBeenCalledWith(storeUrl);
  });
});
