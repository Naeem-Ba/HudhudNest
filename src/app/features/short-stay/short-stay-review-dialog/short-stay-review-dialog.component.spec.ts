import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ShortStayReviewDialogComponent } from './short-stay-review-dialog.component';
import { ShortStayReviewApiService } from '../../../core/api/short-stay-review-api.service';
import { BookingDto } from '../../../core/models/short-stay.model';
import { ToastService } from '../../../shared/services/toast.service';

const booking = { id: 'b1', listingTitle: 'Villa', status: 'Completed', reviewed: false } as BookingDto;

describe('ShortStayReviewDialogComponent', () => {
  let api: jasmine.SpyObj<ShortStayReviewApiService>;
  let toast: jasmine.SpyObj<ToastService>;

  function create() {
    TestBed.configureTestingModule({
      imports: [ShortStayReviewDialogComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ShortStayReviewApiService, useValue: api },
        { provide: ToastService, useValue: toast }
      ]
    });
    const fixture = TestBed.createComponent(ShortStayReviewDialogComponent);
    fixture.componentInstance.booking = booking;
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('ShortStayReviewApiService', ['create']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'show']);
  });

  it('cannot be sent without a star rating', () => {
    const dialog = create();
    expect(dialog.canSubmit()).toBeFalse();
    dialog.submit();
    expect(api.create).not.toHaveBeenCalled();

    dialog.rating.set(4);
    expect(dialog.canSubmit()).toBeTrue();
  });

  it('refuses a comment above the maximum', () => {
    const dialog = create();
    dialog.rating.set(5);
    dialog.comment.set('x'.repeat(dialog.maxLength + 1));
    expect(dialog.canSubmit()).toBeFalse();
  });

  it('sends the booking, rating and comment, then reports the booking as reviewed', () => {
    api.create.and.returnValue(of({} as never));
    const dialog = create();
    const reviewed: string[] = [];
    dialog.reviewed.subscribe(id => reviewed.push(id));
    dialog.rating.set(4);
    dialog.comment.set('clean and quiet');

    dialog.submit();

    expect(api.create).toHaveBeenCalledWith({ bookingId: 'b1', rating: 4, comment: 'clean and quiet' });
    expect(reviewed).toEqual(['b1']);
    expect(dialog.submitting()).toBeFalse();
  });

  it('shows the API refusal inside the dialog and stays open', () => {
    api.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'لا يمكن التقييم: لا توجد خطة فعالة للمضيف' } })));
    const dialog = create();
    const reviewed: string[] = [];
    dialog.reviewed.subscribe(id => reviewed.push(id));
    dialog.rating.set(5);

    dialog.submit();

    expect(dialog.error()).toBe('لا يمكن التقييم: لا توجد خطة فعالة للمضيف');
    expect(reviewed).toEqual([]);
    expect(dialog.submitting()).toBeFalse();
  });

  it('starts empty for the next booking', () => {
    const dialog = create();
    dialog.rating.set(3);
    dialog.comment.set('x');

    dialog.booking = { ...booking, id: 'b2' };

    expect(dialog.rating()).toBe(0);
    expect(dialog.comment()).toBe('');
  });
});
