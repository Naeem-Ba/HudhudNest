// =====================================================================
// ✅ Unit Tests – admin-app-updates.page.spec.ts
// نفس اصطلاح valuation-request.page.spec.ts: مكوّن حقيقي عبر TestBed بتبعيات
// مُجسَّسة، ونقود الـ API العام للصف كما يفعل القالب.
// =====================================================================
import { FormControl, FormGroup } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import {
  AdminAppUpdatesPage,
  compareVersions,
  minimumNotAboveVersionValidator,
  storeUrlValidator,
  versionFormatValidator,
} from './admin-app-updates.page';
import { AdminAppUpdatesService, AppReleaseDto } from '../../core/api/admin-app-updates.service';
import { PagedResult } from '../../core/models/api.model';
import { ToastService } from '../../shared/services/toast.service';

function release(overrides: Partial<AppReleaseDto> = {}): AppReleaseDto {
  return {
    id: 'r1',
    platform: 'Android',
    version: '1.4.0',
    minimumSupportedVersion: '1.2.0',
    storeUrl: null,
    releaseNotesAr: 'ملاحظات',
    releaseNotesEn: null,
    releaseNotesDe: null,
    releaseDate: '2026-09-20T00:00:00Z',
    isEnabled: false,
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
    ...overrides,
  };
}

function pagedOf(items: AppReleaseDto[], totalPages = 1): PagedResult<AppReleaseDto> {
  return { items, totalCount: items.length, page: 1, pageSize: 20, totalPages, hasNext: false, hasPrevious: false };
}

describe('AdminAppUpdatesPage helpers', () => {
  it('compareVersions: مقارنة رقمية لا نصية', () => {
    expect(compareVersions('1.9.9', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('1.1.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.10.0', '1.10.0')).toBe(0);
  });

  it('versionFormatValidator: يقبل major.minor.patch فقط', () => {
    const check = (v: string) => versionFormatValidator(new FormControl(v));
    expect(check('1.4.0')).toBeNull();
    expect(check('0.0.0')).toBeNull();
    expect(check('1.4')).not.toBeNull();
    expect(check('1.4.0.1')).not.toBeNull();
    expect(check('01.4.0')).not.toBeNull();
    expect(check('1.4.0-beta')).not.toBeNull();
    expect(check('v1.4.0')).not.toBeNull();
    expect(check('')).not.toBeNull();
  });

  it('storeUrlValidator: اختياري، وإن وُجد فيجب أن يكون http/https مطلقاً', () => {
    const check = (v: string) => storeUrlValidator(new FormControl(v));
    expect(check('')).toBeNull();
    expect(check('   ')).toBeNull();
    expect(check('https://play.google.com/store/apps/details?id=x')).toBeNull();
    expect(check('http://example.com')).toBeNull();
    expect(check('ftp://example.com')).not.toBeNull();
    expect(check('javascript:alert(1)')).not.toBeNull();
    expect(check('not a url')).not.toBeNull();
  });

  it('minimumNotAboveVersionValidator: يمنع min > version، ولا يتدخل عند صيغة خاطئة', () => {
    const group = (version: string, minimum: string) =>
      new FormGroup({ version: new FormControl(version), minimumSupportedVersion: new FormControl(minimum) });

    expect(minimumNotAboveVersionValidator(group('1.4.0', '1.2.0'))).toBeNull();
    expect(minimumNotAboveVersionValidator(group('1.4.0', '1.4.0'))).toBeNull();
    expect(minimumNotAboveVersionValidator(group('1.4.0', '1.10.0'))).toEqual({ minimumAboveVersion: true });
    expect(minimumNotAboveVersionValidator(group('abc', '1.10.0'))).toBeNull();
    expect(minimumNotAboveVersionValidator(group('1.4.0', ''))).toBeNull();
  });
});

describe('AdminAppUpdatesPage', () => {
  let apiSpy: jasmine.SpyObj<AdminAppUpdatesService>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  function createPage(initial: AppReleaseDto[] = []): AdminAppUpdatesPage {
    apiSpy = jasmine.createSpyObj('AdminAppUpdatesService', [
      'getReleases', 'createRelease', 'updateRelease', 'enableRelease', 'disableRelease', 'deleteRelease',
    ]);
    apiSpy.getReleases.and.returnValue(of(pagedOf(initial)));
    toastSpy = jasmine.createSpyObj('ToastService', ['success', 'error']);

    TestBed.configureTestingModule({
      imports: [AdminAppUpdatesPage],
      providers: [
        { provide: AdminAppUpdatesService, useValue: apiSpy },
        { provide: ToastService, useValue: toastSpy },
      ],
    });

    const page = TestBed.createComponent(AdminAppUpdatesPage).componentInstance;
    page.ngOnInit();
    return page;
  }

  function fillValid(page: AdminAppUpdatesPage): void {
    page.form.patchValue({
      version: '1.4.0',
      minimumSupportedVersion: '1.2.0',
      releaseDate: '2026-09-23',
    });
  }

  it('load: يعبّئ القائمة ويُطفئ التحميل', () => {
    const page = createPage([release()]);
    expect(page.releases().length).toBe(1);
    expect(page.loading()).toBeFalse();
  });

  it('load: يمرّر الفلاتر إلى الخدمة (isEnabled كقيمة منطقية) ويعود للصفحة 1 عند التصفية', () => {
    const page = createPage();
    page.page.set(3);
    page.platformFilter = 'IOS';
    page.enabledFilter = 'false';
    page.applyFilters();

    expect(page.page()).toBe(1);
    expect(apiSpy.getReleases).toHaveBeenCalledWith(
      jasmine.objectContaining({ platform: 'IOS', isEnabled: false, page: 1 })
    );
  });

  it('load: عند الفشل يعرض خطأ ويُطفئ التحميل', () => {
    const page = createPage();
    apiSpy.getReleases.and.returnValue(throwError(() => new Error('boom')));
    page.load();

    expect(toastSpy.error).toHaveBeenCalled();
    expect(page.loading()).toBeFalse();
  });

  it('openEditForm: يعبّئ النموذج ويعطّل حقل المنصة (غير قابل للتعديل)', () => {
    const page = createPage();
    page.openEditForm(release({ platform: 'IOS', version: '2.0.0', minimumSupportedVersion: '1.5.0' }));

    expect(page.showForm()).toBeTrue();
    expect(page.editingId()).toBe('r1');
    expect(page.form.controls.platform.disabled).toBeTrue();
    expect(page.form.getRawValue().platform).toBe('IOS');
    expect(page.form.getRawValue().version).toBe('2.0.0');
  });

  it('openCreateForm: يعيد تفعيل حقل المنصة بعد تعديل سابق', () => {
    const page = createPage();
    page.openEditForm(release());
    page.openCreateForm();

    expect(page.editingId()).toBeNull();
    expect(page.form.controls.platform.enabled).toBeTrue();
    expect(page.form.getRawValue().version).toBe('');
  });

  it('save: نموذج غير صالح لا يستدعي الخادم', () => {
    const page = createPage();
    page.openCreateForm();
    page.form.patchValue({ version: '1.4', minimumSupportedVersion: '1.2.0' });
    page.save();

    expect(apiSpy.createRelease).not.toHaveBeenCalled();
    expect(apiSpy.updateRelease).not.toHaveBeenCalled();
  });

  it('save: min > version يُرفض في الواجهة', () => {
    const page = createPage();
    page.openCreateForm();
    page.form.patchValue({ version: '1.4.0', minimumSupportedVersion: '1.10.0', releaseDate: '2026-09-23' });
    page.save();

    expect(page.form.errors?.['minimumAboveVersion']).toBeTrue();
    expect(apiSpy.createRelease).not.toHaveBeenCalled();
  });

  it('save (إنشاء): يرسل القيم منظَّفة (storeUrl الفارغ → null) ثم يغلق ويعيد التحميل', () => {
    const page = createPage();
    apiSpy.createRelease.and.returnValue(of({ id: 'new' }));
    page.openCreateForm();
    fillValid(page);
    page.form.patchValue({ platform: 'Web', storeUrl: '  ', releaseNotesEn: ' New ', isEnabled: true });
    apiSpy.getReleases.calls.reset();
    page.save();

    const sent = apiSpy.createRelease.calls.mostRecent().args[0];
    expect(sent.platform).toBe('Web');
    expect(sent.storeUrl).toBeNull();
    expect(sent.releaseNotesEn).toBe('New');
    expect(sent.releaseNotesAr).toBeNull();
    expect(sent.isEnabled).toBeTrue();
    expect(toastSpy.success).toHaveBeenCalled();
    expect(page.showForm()).toBeFalse();
    expect(page.saving()).toBeFalse();
    expect(apiSpy.getReleases).toHaveBeenCalled();
  });

  it('save (تعديل): يستدعي updateRelease بالمعرّف ولا يرسل platform', () => {
    const page = createPage();
    apiSpy.updateRelease.and.returnValue(of(undefined));
    page.openEditForm(release({ id: 'r9' }));
    page.save();

    expect(apiSpy.createRelease).not.toHaveBeenCalled();
    const [id, value] = apiSpy.updateRelease.calls.mostRecent().args;
    expect(id).toBe('r9');
    expect('platform' in value).toBeFalse();
  });

  it('save: رسالة خطأ الخادم (مثل 409) تُعرض وتُعاد حالة الحفظ', () => {
    const page = createPage();
    apiSpy.createRelease.and.returnValue(throwError(() => ({ error: { message: 'إصدار مكرر' } })));
    page.openCreateForm();
    fillValid(page);
    page.save();

    expect(toastSpy.error).toHaveBeenCalledWith('إصدار مكرر');
    expect(page.saving()).toBeFalse();
    expect(page.showForm()).toBeTrue();
  });

  it('التفعيل يتطلب تأكيداً: requestEnable لا يستدعي الخادم، confirmEnable يفعل', () => {
    const r = release({ id: 'r1', isEnabled: false });
    const page = createPage([r]);
    apiSpy.enableRelease.and.returnValue(of(undefined));

    page.requestEnable(r);
    expect(page.enablingRelease()).toBe(r);
    expect(apiSpy.enableRelease).not.toHaveBeenCalled();

    page.confirmEnable();
    expect(apiSpy.enableRelease).toHaveBeenCalledOnceWith('r1');
    expect(page.releases()[0].isEnabled).toBeTrue();
    expect(page.enablingRelease()).toBeNull();
    expect(page.actionInFlightId()).toBeNull();
  });

  it('cancelEnable: يلغي دون استدعاء الخادم', () => {
    const r = release();
    const page = createPage([r]);
    page.requestEnable(r);
    page.cancelEnable();

    expect(page.enablingRelease()).toBeNull();
    expect(apiSpy.enableRelease).not.toHaveBeenCalled();
  });

  it('التعطيل مباشر بلا تأكيد', () => {
    const r = release({ isEnabled: true });
    const page = createPage([r]);
    apiSpy.disableRelease.and.returnValue(of(undefined));

    page.disable(r);

    expect(apiSpy.disableRelease).toHaveBeenCalledOnceWith('r1');
    expect(page.releases()[0].isEnabled).toBeFalse();
  });

  it('الحذف يتطلب تأكيداً ثم يعيد التحميل', () => {
    const r = release();
    const page = createPage([r]);
    apiSpy.deleteRelease.and.returnValue(of(undefined));

    page.requestDelete(r);
    expect(apiSpy.deleteRelease).not.toHaveBeenCalled();

    apiSpy.getReleases.calls.reset();
    page.confirmDelete();

    expect(apiSpy.deleteRelease).toHaveBeenCalledOnceWith('r1');
    expect(page.deletingRelease()).toBeNull();
    expect(apiSpy.getReleases).toHaveBeenCalled();
  });

  it('فشل الحذف: خطأ ويُغلق الحوار', () => {
    const r = release();
    const page = createPage([r]);
    apiSpy.deleteRelease.and.returnValue(throwError(() => new Error('x')));

    page.requestDelete(r);
    page.confirmDelete();

    expect(toastSpy.error).toHaveBeenCalled();
    expect(page.deletingRelease()).toBeNull();
    expect(page.actionInFlightId()).toBeNull();
  });
});
