// =====================================================================
// ✅ Unit Tests – admin-users.service.spec.ts
// تغطية: فلاتر GET /Admin/users الجديدة (search/planTier/accountStatus)، تطبيع
// AdminUserDto/AdminUserDetailDto، ونداءات الخطة الإدارية (activate/extend/cancel).
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(AdminUsersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('✅ getUsers: يرسل search/planTier/accountStatus كمعاملات استعلام، ويطبّع الحقول الجديدة', done => {
    service.getUsers(1, 20, { search: 'أحمد', planTier: 'premium', accountStatus: 'Active' }).subscribe(result => {
      expect(result.items.length).toBe(1);
      const user = result.items[0];
      expect(user.phoneNumber).toBe('+963999999999');
      expect(user.accountStatus).toBe('Active');
      expect(user.planTier).toBe('premium');
      expect(user.planStatus).toBe('Active');
      expect(user.totalListings).toBe(3);
      expect(user.activeListings).toBe(2);
      expect(user.featuredListings).toBe(1);
      done();
    });

    const req = httpMock.expectOne(request =>
      request.url === `${environment.apiBaseUrl}/Admin/users`
      && request.params.get('search') === 'أحمد'
      && request.params.get('planTier') === 'premium'
      && request.params.get('accountStatus') === 'Active'
    );

    req.flush({
      total: 1,
      page: 1,
      pageSize: 20,
      data: [{
        id: 'u1',
        email: 'ahmad@example.com',
        phoneNumber: '+963999999999',
        firstName: 'أحمد',
        lastName: 'خالد',
        displayName: null,
        createdAt: '2026-08-01T00:00:00Z',
        roles: ['User'],
        accountStatus: 'Active',
        planTier: 'premium',
        planStatus: 'Active',
        planExpiresAt: '2026-10-01T00:00:00Z',
        totalListings: 3,
        activeListings: 2,
        featuredListings: 1
      }]
    });
  });

  it('✅ getUserDetail: يطبّع الحقول الإضافية (planStartedAt/planActivationSource/listingLimit)', done => {
    service.getUserDetail('u1').subscribe(detail => {
      expect(detail.planStartedAt).toBe('2026-08-01T00:00:00Z');
      expect(detail.planActivationSource).toBe('AdminGrant');
      expect(detail.listingLimit).toBe(250);
      done();
    });

    httpMock.expectOne(`${environment.apiBaseUrl}/Admin/users/u1`).flush({
      id: 'u1',
      email: 'ahmad@example.com',
      phoneNumber: null,
      firstName: 'أحمد',
      lastName: 'خالد',
      displayName: null,
      createdAt: '2026-08-01T00:00:00Z',
      roles: ['User'],
      accountStatus: 'Active',
      planTier: 'premium',
      planNameKey: 'PRICING.PREMIUM.NAME',
      planStatus: 'Active',
      planStartedAt: '2026-08-01T00:00:00Z',
      planExpiresAt: '2026-10-01T00:00:00Z',
      planCancelledAt: null,
      planActivationSource: 'AdminGrant',
      listingLimit: 250,
      totalListings: 3,
      activeListings: 2,
      featuredListings: 1
    });
  });

  it('✅ activatePlan: يرسل tier/durationDays/reason إلى مسار التفعيل', done => {
    service.activatePlan('u1', 'premium', 30, 'ترقية يدوية').subscribe(result => {
      expect(result.message).toContain('activated');
      done();
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/Admin/users/u1/subscription/activate`);
    expect(req.request.body).toEqual({ tier: 'premium', durationDays: 30, reason: 'ترقية يدوية' });
    req.flush({ message: 'Plan activated.' });
  });

  it('✅ extendSubscription: يرسل days/reason إلى مسار التمديد', done => {
    service.extendSubscription('u1', 90).subscribe(() => done());

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/Admin/users/u1/subscription/extend`);
    expect(req.request.body).toEqual({ days: 90, reason: null });
    req.flush({ message: 'Extended.' });
  });

  it('✅ cancelSubscription: يرسل reason إلى مسار الإلغاء', done => {
    service.cancelSubscription('u1', 'طلب المستخدم').subscribe(() => done());

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/Admin/users/u1/subscription/cancel`);
    expect(req.request.body).toEqual({ reason: 'طلب المستخدم' });
    req.flush({ message: 'Cancelled.' });
  });
});
