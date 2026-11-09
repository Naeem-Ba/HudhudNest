import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AdminPaymentRequestsApiService } from '../../core/api/admin-payment-requests-api.service';
import { PendingPaymentRequests } from '../../core/models/payment-request.model';
import { ToastService } from '../../shared/services/toast.service';
import { AdminPaymentRequestsPage, DEFAULT_PLAN_DURATION_DAYS } from './payment-requests.page';

const QUEUE: PendingPaymentRequests = {
  plans: [
    { requestId: 'p1', userId: 'u1', userName: 'Ali', email: 'a@x.de', tier: 'premium', priceUsd: 49, requestedAt: '2026-10-01T10:00:00Z' }
  ],
  featured: [
    { transactionId: 't1', propertyId: 'pr1', propertyTitle: 'Villa', ownerId: 'u2', ownerName: 'Sam', ownerEmail: null, amountUsd: 10, requestedAt: '2026-10-02T10:00:00Z' }
  ],
  extensions: [
    { transactionId: 'x1', propertyId: 'pr3', propertyTitle: 'Flat', ownerId: 'u3', ownerName: 'Lea', ownerEmail: null, amountUsd: 1, requestedAt: '2026-10-03T10:00:00Z', listingExpiresAt: null }
  ]
};

describe('AdminPaymentRequestsPage', () => {
  let api: jasmine.SpyObj<AdminPaymentRequestsApiService>;
  let toast: jasmine.SpyObj<ToastService>;
  let fixture: ComponentFixture<AdminPaymentRequestsPage>;
  let component: AdminPaymentRequestsPage;

  beforeEach(() => {
    api = jasmine.createSpyObj('AdminPaymentRequestsApiService',
      ['getPending', 'approvePlan', 'rejectPlan', 'approveFeatured', 'rejectFeatured', 'approveExtension', 'rejectExtension']);
    api.getPending.and.returnValue(of(QUEUE));
    api.approvePlan.and.returnValue(of({}));
    api.rejectPlan.and.returnValue(of({}));
    api.approveFeatured.and.returnValue(of({}));
    api.rejectFeatured.and.returnValue(of({}));
    api.approveExtension.and.returnValue(of({}));
    api.rejectExtension.and.returnValue(of({}));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
    spyOn(window, 'confirm').and.returnValue(true);

    TestBed.configureTestingModule({
      imports: [AdminPaymentRequestsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AdminPaymentRequestsApiService, useValue: api },
        { provide: ToastService, useValue: toast }
      ]
    });

    fixture = TestBed.createComponent(AdminPaymentRequestsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('يعرض طلبات الخطط وطلبات التمييز', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('[data-testid="plan-request"]').length).toBe(1);
    expect(el.querySelectorAll('[data-testid="featured-request"]').length).toBe(1);
    expect(el.querySelectorAll('[data-testid="extension-request"]').length).toBe(1);
  });

  it('رسوم التمديد: تأكيد يزيل الطلب، ورفض يزيله أيضاً', () => {
    component.approveExtension(QUEUE.extensions[0]);
    expect(api.approveExtension).toHaveBeenCalledWith('x1');
    expect(component.extensions().length).toBe(0);

    component.extensions.set([...QUEUE.extensions]);
    component.rejectExtension(QUEUE.extensions[0]);
    expect(api.rejectExtension).toHaveBeenCalledWith('x1');
    expect(component.extensions().length).toBe(0);
  });

  it('طابور فيه رسوم تمديد فقط لا يظهر كأنه فارغ', () => {
    api.getPending.and.returnValue(of({ plans: [], featured: [], extensions: QUEUE.extensions }));
    component.load();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-empty-state')).toBeNull();
  });

  it('تأكيد خطة: المدة الافتراضية 30 يوماً، ويُزال الطلب من القائمة', () => {
    component.approvePlan(QUEUE.plans[0]);

    expect(api.approvePlan).toHaveBeenCalledWith('p1', DEFAULT_PLAN_DURATION_DAYS);
    expect(component.plans().length).toBe(0);
    expect(toast.success).toHaveBeenCalled();
  });

  it('المشرف يغيّر المدة قبل التأكيد', () => {
    component.setDuration('p1', '90');
    component.approvePlan(QUEUE.plans[0]);
    expect(api.approvePlan).toHaveBeenCalledWith('p1', 90);
  });

  it('مدة غير صالحة لا تُرسَل', () => {
    component.setDuration('p1', '0');
    component.approvePlan(QUEUE.plans[0]);
    expect(api.approvePlan).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('إلغاء نافذة التأكيد لا يرسل شيئاً', () => {
    (window.confirm as jasmine.Spy).and.returnValue(false);
    component.approvePlan(QUEUE.plans[0]);
    component.approveFeatured(QUEUE.featured[0]);
    expect(api.approvePlan).not.toHaveBeenCalled();
    expect(api.approveFeatured).not.toHaveBeenCalled();
  });

  it('تأكيد تمييز إعلان يزيله من القائمة', () => {
    component.approveFeatured(QUEUE.featured[0]);
    expect(api.approveFeatured).toHaveBeenCalledWith('t1');
    expect(component.featured().length).toBe(0);
  });

  it('رفض طلب خطة لا يفعّل شيئاً ويزيل الطلب', () => {
    component.rejectPlan(QUEUE.plans[0]);
    expect(api.rejectPlan).toHaveBeenCalledWith('p1');
    expect(api.approvePlan).not.toHaveBeenCalled();
    expect(component.plans().length).toBe(0);
  });

  it('فشل الإجراء (مثلاً عولج الطلب مسبقاً) ⇐ رسالة خطأ وإعادة تحميل القائمة', () => {
    api.approveFeatured.and.returnValue(throwError(() => new Error('409')));
    api.getPending.calls.reset();

    component.approveFeatured(QUEUE.featured[0]);

    expect(toast.error).toHaveBeenCalled();
    expect(api.getPending).toHaveBeenCalledTimes(1);
    expect(component.busyId()).toBeNull();
  });
});
