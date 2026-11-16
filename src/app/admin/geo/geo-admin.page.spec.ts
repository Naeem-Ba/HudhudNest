import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { LocationsApiService } from '../../core/api/locations-api.service';
import { GeoAdminLocation, GeoPolicy, GeoRequest } from '../../core/models/geo-location.model';
import { ToastService } from '../../shared/services/toast.service';
import { AdminGeoPage } from './geo-admin.page';

const request = (over: Partial<GeoRequest> = {}): GeoRequest => ({
  id: 'r1', type: 'Street', parentLocationId: 4, parentPath: [], proposedName: 'شارع جديد', proposedNameAr: 'شارع جديد',
  proposedNameEn: null, proposedNameDe: null, latitude: null, longitude: null, source: 'User', submittedByUserId: 'u1',
  submittedByName: 'سارة', propertyId: null, status: 'Pending', confidenceScore: 0.6, autoApproved: false,
  decisionCode: 'LOW_CONFIDENCE', decisionReason: 'below the minimum', duplicateOfLocationId: null,
  resultingLocationId: null, reviewNotes: null, createdAt: '2026-11-09T10:00:00Z', ...over
});

const admin = (over: Partial<GeoAdminLocation> = {}): GeoAdminLocation => ({
  id: 4, type: 'District', parentId: 3, countryCode: 'SY', officialName: 'المزة', nameAr: 'المزة', nameEn: 'Mazzeh', nameDe: null,
  latitude: 33.5, longitude: 36.3, source: 'Seed', verificationStatus: 'Verified', approvalStatus: 'Approved',
  confidenceScore: null, autoApproved: false, approvalReason: null, isActive: true, isArchived: false,
  mergedIntoLocationId: null, childCount: 2, listingCount: 5, aliases: ['Mezzeh'], path: [], updatedAt: '', ...over
});

const policy: GeoPolicy = {
  streetAutoApprovalEnabled: true, streetAutoApprovalMinScore: 0.75, maxAutoApprovalsPerUserPerDay: 10,
  fuzzyDuplicateThreshold: 0.85, externalLookupEnabled: false, updatedAt: ''
};

describe('AdminGeoPage', () => {
  let api: jasmine.SpyObj<LocationsApiService>;
  let toast: jasmine.SpyObj<ToastService>;
  let page: AdminGeoPage;
  let fixture: ComponentFixture<AdminGeoPage>;

  beforeEach(() => {
    api = jasmine.createSpyObj<LocationsApiService>('LocationsApiService', [
      'adminRequests', 'approveRequest', 'rejectRequest', 'needsCorrection', 'markDuplicate', 'adminList', 'adminUpdate',
      'adminCreate', 'setActive', 'setArchived', 'addAlias', 'removeAlias', 'merge', 'changes', 'getPolicy', 'updatePolicy',
      'importRows', 'commitImport', 'rollbackImport'
    ]);
    api.adminRequests.and.returnValue(of({ items: [request()], total: 1 }));
    api.adminList.and.returnValue(of({ items: [admin()], total: 1 }));
    api.getPolicy.and.returnValue(of({ ...policy }));
    api.changes.and.returnValue(of([]));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);

    TestBed.configureTestingModule({
      imports: [AdminGeoPage, TranslateModule.forRoot()],
      providers: [{ provide: LocationsApiService, useValue: api }, { provide: ToastService, useValue: toast }]
    });
    fixture = TestBed.createComponent(AdminGeoPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('opens on the pending requests', () => {
    expect(api.adminRequests).toHaveBeenCalledWith('Pending', null);
    expect(page.requests().length).toBe(1);
  });

  it('approving sends the edited names and notes, then reloads the queue', () => {
    api.approveRequest.and.returnValue(of({ id: 'r1', status: 'Approved' } as never));
    page.pickRequest(request());
    page.reviewNameEn = 'New Street';
    page.reviewNotes = 'checked on the map';
    page.approveRequest(request());

    expect(api.approveRequest).toHaveBeenCalledWith('r1', jasmine.objectContaining({ nameAr: 'شارع جديد', nameEn: 'New Street', notes: 'checked on the map' }));
    expect(toast.success).toHaveBeenCalled();
    expect(page.selectedRequest()).toBeNull();
    expect(api.adminRequests).toHaveBeenCalledTimes(2);
  });

  it('marking a duplicate sends the id of the existing place', () => {
    api.markDuplicate.and.returnValue(of({ id: 'r1', status: 'Duplicate' } as never));
    page.pickRequest(request());
    page.duplicateOfId = 12;
    page.markDuplicate(request());
    expect(api.markDuplicate).toHaveBeenCalledWith('r1', 12, undefined);
  });

  it('a failed decision keeps the request on screen and re-enables the buttons', () => {
    api.rejectRequest.and.returnValue(throwError(() => new Error('409')));
    page.pickRequest(request());
    page.rejectRequest(request());
    expect(page.selectedRequest()).not.toBeNull();
    expect(page.busy()).toBeFalse();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('the places tab starts at the governorates and drills into a place', () => {
    page.openTab('places');
    expect(api.adminList).toHaveBeenCalledWith(jasmine.objectContaining({ parentId: null, type: 'Governorate' }));

    page.openPlace(admin());
    expect(page.trail().map(p => p.id)).toEqual([4]);
    expect(api.adminList).toHaveBeenCalledWith(jasmine.objectContaining({ parentId: 4, type: null }));

    page.browseRoot();
    expect(page.trail()).toEqual([]);
  });

  it('saving a place sends the reason; clearing the coordinates is explicit', () => {
    api.adminUpdate.and.returnValue(of(admin({ nameEn: 'Mezzeh' })));
    page.openTab('places');
    page.pickPlace(admin());
    page.editNameEn = 'Mezzeh';
    page.editLat = null;
    page.editLng = null;
    page.reason = 'spelling';
    page.savePlace(admin());

    expect(api.adminUpdate).toHaveBeenCalledWith(4, jasmine.objectContaining({
      nameEn: 'Mezzeh', clearCoordinates: true, latitude: null, longitude: null, reason: 'spelling'
    }));
    expect(page.places()[0].nameEn).toBe('Mezzeh');
  });

  it('a place can only get the next level down as a child', () => {
    expect(page.nextLevel(admin({ type: 'District' }))).toBe('Neighborhood');
    expect(page.nextLevel(admin({ type: 'Street' }))).toBeNull();
  });

  it('merging asks for confirmation and does nothing when declined', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    page.pickPlace(admin());
    page.mergeTargetId = 9;
    page.merge(admin());
    expect(api.merge).not.toHaveBeenCalled();
  });

  it('saves the policy', () => {
    api.updatePolicy.and.returnValue(of({ ...policy, streetAutoApprovalEnabled: false }));
    page.openTab('policy');
    const pol = page.policy()!;
    pol.streetAutoApprovalEnabled = false;
    page.savePolicy(pol);
    expect(api.updatePolicy).toHaveBeenCalledWith(jasmine.objectContaining({ streetAutoApprovalEnabled: false }));
    expect(page.policy()?.streetAutoApprovalEnabled).toBeFalse();
  });

  it('import refuses text that is not a JSON list, before calling the server', () => {
    page.importJson = '{"not":"a list"}';
    page.runImport(true);
    expect(api.importRows).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();

    page.importJson = 'nonsense';
    page.runImport(false);
    expect(api.importRows).not.toHaveBeenCalled();
  });

  it('a dry run is sent as a dry run, and a staged batch can be committed', () => {
    api.importRows.and.returnValue(of({ batchId: 'b1', dryRun: true, rowsTotal: 1, rowsStaged: 1, rowsSkipped: 0, issues: [] }));
    api.commitImport.and.returnValue(of({ committed: 1 }));
    page.importName = 'Damascus streets';
    page.importJson = '[{"key":"a","type":"Street","nameAr":"ش"}]';
    page.runImport(true);
    expect(api.importRows).toHaveBeenCalledWith(jasmine.objectContaining({ dryRun: true, name: 'Damascus streets' }));

    page.commitImport('b1');
    expect(api.commitImport).toHaveBeenCalledWith('b1');
    expect(page.importResult()).toBeNull();
  });

  it('shows the change log of one place', () => {
    page.showChangesFor(admin());
    expect(page.tab()).toBe('changes');
    expect(api.changes).toHaveBeenCalledWith(4);
  });
});
