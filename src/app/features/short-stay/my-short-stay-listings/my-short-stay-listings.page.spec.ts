import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { ShortStayListingSummary } from '../../../core/models/short-stay.model';
import { ToastService } from '../../../shared/services/toast.service';
import { MyShortStayListingsPage } from './my-short-stay-listings.page';

// Consistency audit P3-3: the API could delete a short-stay listing but the app only offered "unpublish".
describe('MyShortStayListingsPage — delete', () => {
  let fixture: ComponentFixture<MyShortStayListingsPage>;
  let api: jasmine.SpyObj<ShortStayListingApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  const listing = (id: string) =>
    ({ id, title: `Chalet ${id}`, city: 'Latakia', capacity: 4, isPublished: true, isTakenDown: false } as unknown as ShortStayListingSummary);

  beforeEach(() => {
    api = jasmine.createSpyObj('ShortStayListingApiService', ['getMine', 'delete', 'publish', 'unpublish']);
    api.getMine.and.returnValue(of([listing('a'), listing('b')]));
    toast = jasmine.createSpyObj('ToastService', ['show']);

    TestBed.configureTestingModule({
      imports: [MyShortStayListingsPage, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ShortStayListingApiService, useValue: api },
        { provide: ToastService, useValue: toast }
      ]
    });
    fixture = TestBed.createComponent(MyShortStayListingsPage);
    fixture.detectChanges();
  });

  const deleteButtons = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-testid="delete-listing"]'));

  it('shows a delete button on every listing', () => {
    expect(deleteButtons().length).toBe(2);
  });

  it('deletes after confirmation and removes the card', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    api.delete.and.returnValue(of(undefined));

    deleteButtons()[0].click();
    fixture.detectChanges();

    expect(api.delete).toHaveBeenCalledOnceWith('a');
    expect(fixture.componentInstance.listings().map(l => l.id)).toEqual(['b']);
    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.MY_LISTINGS.DELETE_SUCCESS', 'success');
  });

  it('does nothing when the owner cancels', () => {
    spyOn(window, 'confirm').and.returnValue(false);

    deleteButtons()[0].click();

    expect(api.delete).not.toHaveBeenCalled();
    expect(fixture.componentInstance.listings().length).toBe(2);
  });

  it('explains a 409 (bookings in progress) and keeps the listing', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    api.delete.and.returnValue(throwError(() => ({ status: 409, error: { message: 'server text' } })));

    deleteButtons()[1].click();

    expect(toast.show).toHaveBeenCalledWith('SHORTSTAY.MY_LISTINGS.DELETE_HAS_BOOKINGS', 'error');
    expect(fixture.componentInstance.listings().length).toBe(2);
    expect(fixture.componentInstance.deletingId()).toBeNull();
  });
});
