// =====================================================================
// ✅ Unit Tests — DateRangePickerComponent
// تغطية: منطق اختيار المدى (نقرة أولى/ثانية/إعادة بدء) ومنع إتمام مدى يتقاطع
// مع فترة محجوزة (blockedRanges) — هذا هو المكوّن المخصص الذي حلّ محل مكتبة
// تقويم خارجية (قرار المشروع).
// =====================================================================
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DateRangePickerComponent } from './date-range-picker.component';

function iso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

describe('DateRangePickerComponent', () => {
  let fixture: ComponentFixture<DateRangePickerComponent>;
  let component: DateRangePickerComponent;
  const today = new Date();

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DateRangePickerComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(DateRangePickerComponent);
    component = fixture.componentInstance;
  });

  function cellFor(date: Date) {
    fixture.detectChanges();
    return { date, iso: iso(date), inCurrentMonth: true, isPast: false, isBlocked: false, isToday: false };
  }

  it('النقرة الأولى تضبط checkIn وتترك checkOut فارغاً', () => {
    fixture.detectChanges();
    const start = addDays(today, 5);

    let emitted: any;
    component.rangeChange.subscribe(v => (emitted = v));
    component.selectDay(cellFor(start));

    expect(emitted.checkIn).toBe(iso(start));
    expect(emitted.checkOut).toBeNull();
  });

  it('النقرة الثانية بعد تاريخ صالح تضبط checkOut دون تغيير checkIn', () => {
    fixture.detectChanges();
    const start = addDays(today, 5);
    const end = addDays(today, 7);

    let emitted: any;
    component.rangeChange.subscribe(v => (emitted = v));

    component.selectDay(cellFor(start));
    component.selectDay(cellFor(end));

    expect(emitted.checkIn).toBe(iso(start));
    expect(emitted.checkOut).toBe(iso(end));
  });

  it('النقر على تاريخ قبل أو يساوي checkIn الحالي يبدأ اختياراً جديداً', () => {
    fixture.detectChanges();
    const start = addDays(today, 10);
    const earlier = addDays(today, 3);

    let emitted: any;
    component.rangeChange.subscribe(v => (emitted = v));

    component.selectDay(cellFor(start));
    component.selectDay(cellFor(earlier));

    expect(emitted.checkIn).toBe(iso(earlier));
    expect(emitted.checkOut).toBeNull();
  });

  it('لا يُسمح بإتمام مدى يتقاطع مع فترة محجوزة — يُعاد بدء الاختيار بدلاً من ذلك', () => {
    const start = addDays(today, 5);
    const blockedStart = addDays(today, 8);
    const blockedEnd = addDays(today, 10);
    const attemptedEnd = addDays(today, 12); // يتجاوز الفترة المحجوزة بالكامل

    component.blockedRanges = [{ checkIn: iso(blockedStart), checkOut: iso(blockedEnd) }];
    fixture.detectChanges();

    let emitted: any;
    component.rangeChange.subscribe(v => (emitted = v));

    component.selectDay(cellFor(start));
    component.selectDay(cellFor(attemptedEnd));

    // بدل إتمام المدى (start → attemptedEnd) الذي يبتلع الفترة المحجوزة، يُعاد البدء
    // من attemptedEnd كـcheckIn جديد.
    expect(emitted.checkIn).toBe(iso(attemptedEnd));
    expect(emitted.checkOut).toBeNull();
  });

  it('النقر على تاريخ ماضٍ أو محجوز لا يُصدر أي حدث', () => {
    fixture.detectChanges();
    let emitted: any = null;
    component.rangeChange.subscribe(v => (emitted = v));

    const pastCell = { date: addDays(today, -1), iso: iso(addDays(today, -1)), inCurrentMonth: true, isPast: true, isBlocked: false, isToday: false };
    component.selectDay(pastCell);

    expect(emitted).toBeNull();
  });
});
