import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { AgencyProfilePanelComponent, COVER_MAX_BYTES } from './agency-profile-panel.component';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { Agency } from '../../core/models/agency.model';
import { ToastService } from '../../shared/services/toast.service';

const AGENCY: Agency = {
  id: 'agency-1', name: 'مكتب الياسمين', slug: 'yasmin', countryCode: 'SY', ownerUserId: 'owner-1', isActive: true,
  memberCount: 1, createdAt: '2026-01-01T00:00:00Z', members: [],
  website: 'https://office.example.sy/',
  socialLinks: [{ network: 'WhatsApp', value: '+963944123456' }, { network: 'Facebook', value: 'https://facebook.com/office' }]
};

describe('AgencyProfilePanelComponent', () => {
  let api: jasmine.SpyObj<AgenciesApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  function create(agency: Agency = AGENCY) {
    TestBed.configureTestingModule({
      imports: [AgencyProfilePanelComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AgenciesApiService, useValue: api },
        { provide: ToastService, useValue: toast }
      ]
    });
    const fixture = TestBed.createComponent(AgencyProfilePanelComponent);
    fixture.componentInstance.agency = agency;
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AgenciesApiService', ['uploadCover', 'removeCover', 'setContactLinks', 'setWorkingHours']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
  });

  it('fills the form from the office and sends only the filled links', () => {
    api.setContactLinks.and.returnValue(of(AGENCY));
    const fixture = create();
    const panel = fixture.componentInstance;
    expect(panel.website).toBe('https://office.example.sy/');
    expect(panel.links.WhatsApp).toBe('+963944123456');

    panel.links.Facebook = '';
    panel.links.Instagram = '  @office  ';
    const changed = spyOn(panel.agencyChanged, 'emit');
    panel.saveLinks();

    expect(api.setContactLinks).toHaveBeenCalledWith('agency-1', {
      website: 'https://office.example.sy/',
      links: [{ network: 'WhatsApp', value: '+963944123456' }, { network: 'Instagram', value: '@office' }]
    });
    expect(changed).toHaveBeenCalledWith(AGENCY);
  });

  it('marks the exact fields the server refused', () => {
    api.setContactLinks.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 422, error: { errorCodes: { 'Links[1]': ['AGENCY_SOCIAL_INVALID'] } }
    })));
    const fixture = create();
    const panel = fixture.componentInstance;
    panel.saveLinks();
    fixture.detectChanges();

    expect(panel.errors().links.Facebook).toBe('OFFICE_PROFILE.ERR_LINK');
    expect(panel.errors().links.WhatsApp).toBeUndefined();
    expect(panel.busy()).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it('refuses a cover that is too large or not PNG/JPEG/WebP before uploading', () => {
    const fixture = create();
    const panel = fixture.componentInstance;
    const pick = (file: File) => panel.onCoverSelected({ files: [file], value: '' } as unknown as HTMLInputElement);

    pick(new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(panel.coverError()).toBe('OFFICE_PROFILE.COVER_TYPE');
    pick(new File([new Uint8Array(COVER_MAX_BYTES + 1)], 'a.png', { type: 'image/png' }));
    expect(panel.coverError()).toBe('OFFICE_PROFILE.COVER_TOO_LARGE');
    expect(api.uploadCover).not.toHaveBeenCalled();

    api.uploadCover.and.returnValue(of({ ...AGENCY, coverImageUrl: 'https://img/cover.png' }));
    pick(new File(['x'], 'a.png', { type: 'image/png' }));
    expect(api.uploadCover).toHaveBeenCalled();
    expect(panel.coverError()).toBeNull();
    // WebP is accepted by the API for the cover and the logo (it already was for listing photos).
    pick(new File(['x'], 'a.webp', { type: 'image/webp' }));
    expect(api.uploadCover).toHaveBeenCalledTimes(2);
    expect(panel.coverError()).toBeNull();
  });

  it('starts an editable week, checks it locally, and saves all seven days', () => {
    api.setWorkingHours.and.returnValue(of(AGENCY));
    const fixture = create();
    const panel = fixture.componentInstance;
    expect(panel.week()).toBeNull();

    panel.startHours();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.hours__day').length).toBe(7);

    panel.addRange(0);
    panel.week()![0].ranges[1].opens = '16:00'; // before the first period ends at 17:00
    panel.saveHours();
    expect(panel.hoursError()).toBe('OFFICE_PROFILE.HOURS_ERR_OVERLAP');
    expect(api.setWorkingHours).not.toHaveBeenCalled();

    panel.removeRange(0, 1);
    panel.toggleClosed(1); // Sunday closed
    panel.saveHours();
    const sent = api.setWorkingHours.calls.mostRecent().args[1]!;
    expect(sent.length).toBe(7);
    expect(sent[1]).toEqual({ day: 'Sunday', ranges: [] });
  });

  it('clears saved hours on the server, and unsaved ones only locally', () => {
    api.setWorkingHours.and.returnValue(of(AGENCY));
    let panel = create().componentInstance;
    panel.startHours();
    panel.clearHours();
    expect(panel.week()).toBeNull();
    expect(api.setWorkingHours).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    panel = create({ ...AGENCY, workingHours: [{ day: 'Monday', ranges: [] }] }).componentInstance;
    panel.clearHours();
    expect(api.setWorkingHours).toHaveBeenCalledWith('agency-1', null);
  });
});
