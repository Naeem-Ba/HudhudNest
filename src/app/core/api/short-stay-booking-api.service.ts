// Endpoints (HudhudNestApi.Controllers.ShortStayBookingsController):
//   GET    /api/short-stay/bookings/mine                                ← حجوزاتي (ضيف)
//   GET    /api/short-stay/bookings/host-requests                       ← طلبات حجز وحداتي (مضيف)
//   GET    /api/short-stay/bookings/units/{unitId}/availability          ← تقويم التوفر (anonymous)
//   GET    /api/short-stay/bookings/pricing-preview                      ← معاينة السعر (anonymous)
//   POST   /api/short-stay/bookings                                     ← إنشاء حجز
//   PUT    /api/short-stay/bookings/{id}/approve|reject|record-deposit-paid|confirm|check-in|check-out|complete
//   DELETE /api/short-stay/bookings/{id}                                 ← إلغاء

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import {
  BookingDto,
  CreateBookingRequest,
  PricingBreakdown,
  UnitAvailabilityRange
} from '../models/short-stay.model';

@Injectable({ providedIn: 'root' })
export class ShortStayBookingApiService {
  private readonly endpoint = '/short-stay/bookings';

  constructor(private readonly api: BackendApiService) {}

  getMine(): Observable<BookingDto[]> {
    return this.api
      .get<BookingDto[] | ApiPagedResult<BookingDto>>(`${this.endpoint}/mine`)
      .pipe(map(response => unwrapItems(response)));
  }

  getHostRequests(): Observable<BookingDto[]> {
    return this.api
      .get<BookingDto[] | ApiPagedResult<BookingDto>>(`${this.endpoint}/host-requests`)
      .pipe(map(response => unwrapItems(response)));
  }

  getUnitAvailability(unitId: string, from: string, to: string): Observable<UnitAvailabilityRange[]> {
    return this.api
      .get<UnitAvailabilityRange[] | ApiPagedResult<UnitAvailabilityRange>>(
        `${this.endpoint}/units/${unitId}/availability`,
        { from, to }
      )
      .pipe(map(response => unwrapItems(response)));
  }

  /**
   * السعر النهائي هو دائماً حساب الخادم — هذا الاستدعاء لا يُنشئ حجزاً، فقط يعاينه.
   * الحجز الفعلي (create) يعيد حساب السعر من الصفر بشكل مستقل (spec §18).
   */
  getPricingPreview(
    unitId: string, checkIn: string, checkOut: string, adults: number, children: number, infants: number
  ): Observable<PricingBreakdown> {
    return this.api.get<PricingBreakdown>(`${this.endpoint}/pricing-preview`, {
      unitId, checkIn, checkOut, adults, children, infants
    });
  }

  create(request: CreateBookingRequest): Observable<BookingDto> {
    return this.api.post<BookingDto>(this.endpoint, request);
  }

  approve(id: string, note?: string): Observable<BookingDto> {
    return this.api.put<BookingDto>(`${this.endpoint}/${id}/approve`, { note: note ?? null });
  }

  reject(id: string, note?: string): Observable<BookingDto> {
    return this.api.put<BookingDto>(`${this.endpoint}/${id}/reject`, { note: note ?? null });
  }

  recordDepositPaid(id: string): Observable<BookingDto> {
    return this.api.put<BookingDto>(`${this.endpoint}/${id}/record-deposit-paid`);
  }

  confirm(id: string): Observable<BookingDto> {
    return this.api.put<BookingDto>(`${this.endpoint}/${id}/confirm`);
  }

  checkIn(id: string): Observable<BookingDto> {
    return this.api.put<BookingDto>(`${this.endpoint}/${id}/check-in`);
  }

  checkOut(id: string): Observable<BookingDto> {
    return this.api.put<BookingDto>(`${this.endpoint}/${id}/check-out`);
  }

  complete(id: string): Observable<BookingDto> {
    return this.api.put<BookingDto>(`${this.endpoint}/${id}/complete`);
  }

  cancel(id: string, note?: string): Observable<BookingDto> {
    return this.api.delete<BookingDto>(`${this.endpoint}/${id}`, { note: note ?? null });
  }
}
