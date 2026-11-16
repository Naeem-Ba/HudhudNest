import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AgencyBranchesPanelComponent, toBranchInput } from './agency-branches-panel.component';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { LookupsApiService } from '../../core/api/lookups-api.service';
import { Agency, AgencyBranch } from '../../core/models/agency.model';
import { LanguageService } from '../../core/services/language.service';
import { ToastService } from '../../shared/services/toast.service';

const AGENCY: Agency = {
  id: 'agency-1', name: 'XYZ', slug: 'xyz', countryCode: 'SY', ownerUserId: 'owner-1', isActive: true,
  memberCount: 1, createdAt: '2026-01-01T00:00:00Z', members: [], governorateId: 1
};

const MAIN: AgencyBranch = { id: 'b1', name: 'Head office', isMain: true, governorateId: 1, districtId: 4, latitude: 33.5, longitude: 36.3 };
const KIOSK: AgencyBranch = { id: 'b2', name: 'Kiosk', isMain: false, governorateId: 1, latitude: null, longitude: null };

describe('toBranchInput', () => {
  it('trims text, turns empty text into null and rounds the pin to six decimals', () => {
    expect(toBranchInput({
      name: '  Mezzeh  ', governorateId: 1, districtId: 4, neighborhoodId: 9, address: '   ', contactPhone: ' +963 11 ',
      pin: { lat: 33.12345678, lng: 36.87654321 }, isMain: true
    })).toEqual({
      name: 'Mezzeh', governorateId: 1, districtId: 4, neighborhoodId: 9, address: null, contactPhone: '+963 11',
      latitude: 33.123457, longitude: 36.876543, isMain: true
    });
  });

  it('sends no neighborhood without a district, and no coordinates without a pin', () => {
    const body = toBranchInput({
      name: 'A', governorateId: 1, districtId: null, neighborhoodId: 9, address: '', contactPhone: '', pin: null, isMain: false
    });
    expect(body.neighborhoodId).toBeNull();
    expect(body.latitude).toBeNull();
    expect(body.longitude).toBeNull();
  });
});

describe('AgencyBranchesPanelComponent', () => {
  let api: jasmine.SpyObj<AgenciesApiService>;
  let toast: jasmine.SpyObj<ToastService>;
  let lookups: jasmine.SpyObj<LookupsApiService>;

  function create(agency: Agency = { ...AGENCY, branches: [MAIN, KIOSK] }) {
    TestBed.configureTestingModule({
      imports: [AgencyBranchesPanelComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AgenciesApiService, useValue: api },
        { provide: LookupsApiService, useValue: lookups },
        { provide: ToastService, useValue: toast },
        { provide: LanguageService, useValue: { getCurrent: () => 'en', currentLang$: of('en') } }
      ]
    });
    const fixture = TestBed.createComponent(AgencyBranchesPanelComponent);
    fixture.componentInstance.agency = agency;
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AgenciesApiService', ['addBranch', 'updateBranch', 'deleteBranch']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
    lookups = jasmine.createSpyObj('LookupsApiService', ['getGovernorates', 'getDistricts', 'getNeighborhoods']);
    lookups.getGovernorates.and.returnValue(of([{ id: 1, nameAr: 'دمشق', nameEn: 'Damascus' }] as never));
    lookups.getDistricts.and.returnValue(of([{ id: 4, nameAr: 'المزة', nameEn: 'Mezzeh' }] as never));
    lookups.getNeighborhoods.and.returnValue(of([]));
  });

  it('lists the branches with their place and whether they are on the map', () => {
    const fixture = create();
    const panel = fixture.componentInstance;
    expect(panel.branches().map(b => b.id)).toEqual(['b1', 'b2']);
    expect(panel.placeName(MAIN)).toBe('Mezzeh, Damascus');
    expect(panel.placeName(KIOSK)).toBe('Damascus');
  });

  it('adds a branch starting from the office governorate and reports the new list', () => {
    const fixture = create({ ...AGENCY, branches: [] });
    const panel = fixture.componentInstance;
    const changed = jasmine.createSpy('changed');
    panel.branchesChanged.subscribe(changed);
    api.addBranch.and.returnValue(of([MAIN]));

    panel.startAdd();
    expect(panel.draft!.governorateId).toBe(1);
    panel.draft!.name = 'Head office';
    panel.save();

    expect(api.addBranch).toHaveBeenCalledWith('agency-1', jasmine.objectContaining({ name: 'Head office', governorateId: 1 }));
    expect(changed).toHaveBeenCalledWith([MAIN]);
    expect(panel.editing()).toBeFalse();
    expect(toast.success).toHaveBeenCalled();
  });

  it('does not send a branch without a name or governorate', () => {
    const panel = create().componentInstance;
    panel.startAdd();
    panel.draft!.name = '   ';
    panel.save();
    panel.draft!.name = 'A';
    panel.onGovernorate(null);
    panel.save();
    expect(api.addBranch).not.toHaveBeenCalled();
  });

  it('edits the chosen branch with its saved pin and clears district and neighborhood when the governorate changes', () => {
    const panel = create().componentInstance;
    api.updateBranch.and.returnValue(of([MAIN, KIOSK]));
    panel.startEdit(MAIN);
    expect(panel.draft!.pin).toEqual({ lat: 33.5, lng: 36.3 });
    panel.save();
    expect(api.updateBranch).toHaveBeenCalledWith('agency-1', 'b1', jasmine.objectContaining({ latitude: 33.5, longitude: 36.3, isMain: true }));

    panel.startEdit(MAIN);
    panel.onGovernorate(2);
    expect(panel.draft!.districtId).toBeNull();
    expect(panel.draft!.neighborhoodId).toBeNull();
  });

  it('keeps the form open and shows the server message when saving fails', () => {
    const panel = create().componentInstance;
    api.addBranch.and.returnValue(throwError(() => ({ error: { message: 'limit reached' } })));
    panel.startAdd();
    panel.draft!.name = 'A';
    panel.save();
    expect(panel.editing()).toBeTrue();
    expect(panel.busy()).toBeFalse();
    expect(toast.error).toHaveBeenCalled();
  });

  it('deletes only after confirmation and takes the server list as the truth', () => {
    const panel = create().componentInstance;
    api.deleteBranch.and.returnValue(of([{ ...KIOSK, isMain: true }]));
    panel.confirmDelete();
    expect(api.deleteBranch).not.toHaveBeenCalled();
    panel.askDelete(MAIN);
    panel.confirmDelete();
    expect(api.deleteBranch).toHaveBeenCalledWith('agency-1', 'b1');
    expect(panel.branches()).toEqual([{ ...KIOSK, isMain: true }]);
    expect(panel.deleting()).toBeNull();
  });
});
