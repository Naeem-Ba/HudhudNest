import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { OfficeQrRedirectPage } from './office-qr-redirect.page';
import { AgenciesApiService } from '../../core/api/agencies-api.service';

describe('OfficeQrRedirectPage', () => {
  let api: jasmine.SpyObj<AgenciesApiService>;

  function create(code: string) {
    TestBed.configureTestingModule({
      imports: [OfficeQrRedirectPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ code }) } } },
        { provide: AgenciesApiService, useValue: api }
      ]
    });
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(OfficeQrRedirectPage);
    fixture.detectChanges();
    return { fixture, navigate };
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('AgenciesApiService', ['resolveQrCode']);
  });

  it('replaces the URL with the office page and marks the visit as a QR visit', () => {
    api.resolveQrCode.and.returnValue(of({ slug: 'yasmin' }));
    const { navigate } = create('ab23cd45');
    expect(api.resolveQrCode).toHaveBeenCalledWith('ab23cd45');
    expect(navigate).toHaveBeenCalledWith(['/offices', 'yasmin'], { replaceUrl: true, state: { officeVisitSource: 'Qr' } });
  });

  it('shows "unknown code" when the server does not know it', () => {
    api.resolveQrCode.and.returnValue(throwError(() => ({ status: 404 })));
    const { fixture, navigate } = create('ab23cd45');
    fixture.detectChanges();
    expect(fixture.componentInstance.failed()).toBeTrue();
    expect(navigate).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('OFFICE_QR.NOT_FOUND_TITLE');
  });

  it('does not ask the server about something that cannot be a code', () => {
    const { fixture } = create('../../etc');
    expect(api.resolveQrCode).not.toHaveBeenCalled();
    expect(fixture.componentInstance.failed()).toBeTrue();
  });
});
