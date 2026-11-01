// مكوّن تقويم مخصص بسيط لاختيار مدى تاريخ (تسجيل الوصول/المغادرة) — بديل عن مكتبة خارجية
// (قرار المشروع: "منتقي التاريخ: مكوّن Angular مخصص بسيط بدل مكتبة خارجية"، لا توجد مكتبة
// تقويم مثبّتة في المشروع أصلاً). تقويم ميلادي صِرف (لا حاجة لحساب هجري هنا).
//
// الاستخدام:
//   <app-date-range-picker
//     [checkIn]="checkIn()" [checkOut]="checkOut()"
//     [blockedRanges]="blockedRanges()" [minNights]="minNights()"
//     (rangeChange)="onRangeChange($event)" />
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LocalizedDatePipe } from '../pipes/localized-date.pipe';

export interface DateRangeValue {
  checkIn: string | null;
  checkOut: string | null;
}

interface DayCell {
  date: Date;
  iso: string;
  inCurrentMonth: boolean;
  isPast: boolean;
  isBlocked: boolean;
  isToday: boolean;
}

const DAY_MS = 86_400_000;

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [ LocalizedDatePipe,CommonModule, TranslateModule],
  templateUrl: './date-range-picker.component.html',
  styleUrls: ['./date-range-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DateRangePickerComponent implements OnInit, OnChanges {
  @Input() checkIn: string | null = null;
  @Input() checkOut: string | null = null;
  /** فترات محجوزة/محظورة — بصيغة [checkIn, checkOut) نصف مفتوحة، مطابقة لباك اند UnitBookingRange. */
  @Input() blockedRanges: Array<{ checkIn: string; checkOut: string }> = [];
  @Input() minNights = 1;
  /** أقصى عدد أيام يمكن الحجز مقدماً — اختياري، افتراضياً سنة كاملة. */
  @Input() maxAdvanceDays = 365;

  @Output() readonly rangeChange = new EventEmitter<DateRangeValue>();

  readonly viewMonth = signal(startOfDay(new Date()));
  readonly weekdayKeys = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  weeks: DayCell[][] = [];

  private today = startOfDay(new Date());
  private maxDate = new Date(this.today.getTime() + this.maxAdvanceDays * DAY_MS);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['blockedRanges'] || changes['maxAdvanceDays']) {
      this.maxDate = new Date(this.today.getTime() + this.maxAdvanceDays * DAY_MS);
    }
    this.rebuild();
  }

  ngOnInit(): void {
    // Start the visible month on the current check-in, if one is already set.
    if (this.checkIn) {
      const parsed = this.parseIso(this.checkIn);
      if (parsed) this.viewMonth.set(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
    this.rebuild();
  }

  prevMonth(): void {
    const m = this.viewMonth();
    this.viewMonth.set(new Date(m.getFullYear(), m.getMonth() - 1, 1));
    this.rebuild();
  }

  nextMonth(): void {
    const m = this.viewMonth();
    this.viewMonth.set(new Date(m.getFullYear(), m.getMonth() + 1, 1));
    this.rebuild();
  }

  selectDay(cell: DayCell): void {
    if (cell.isPast || cell.isBlocked) return;

    const hasStart = !!this.checkIn;
    const hasEnd = !!this.checkOut;

    if (!hasStart || (hasStart && hasEnd)) {
      // بدء اختيار جديد.
      this.emit(cell.iso, null);
      return;
    }

    // لدينا checkIn فقط — هذا النقر الثاني.
    const start = this.parseIso(this.checkIn!)!;
    if (cell.date.getTime() <= start.getTime()) {
      // نقر على تاريخ قبل/يساوي البداية — يبدأ اختياراً جديداً بدلاً منها.
      this.emit(cell.iso, null);
      return;
    }

    if (this.rangeOverlapsBlocked(start, cell.date)) {
      // لا يمكن إتمام المدى فوق فترة محجوزة — أعد البدء من هذا التاريخ.
      this.emit(cell.iso, null);
      return;
    }

    const nights = Math.round((cell.date.getTime() - start.getTime()) / DAY_MS);
    if (nights < this.minNights) {
      // أقل من الحد الأدنى للإقامة — لا نمنع الاختيار، لكن الطبقة الأعلى (صفحة التفاصيل)
      // تعرض تحذيراً وتمنع الإرسال بالاعتماد على الباك اند كمصدر حقيقة نهائي.
    }

    this.emit(this.checkIn, cell.iso);
  }

  isInRange(cell: DayCell): boolean {
    if (!this.checkIn || !this.checkOut) return false;
    const start = this.parseIso(this.checkIn)!;
    const end = this.parseIso(this.checkOut)!;
    return cell.date.getTime() > start.getTime() && cell.date.getTime() < end.getTime();
  }

  isRangeEdge(cell: DayCell): 'start' | 'end' | null {
    if (this.checkIn === cell.iso) return 'start';
    if (this.checkOut === cell.iso) return 'end';
    return null;
  }

  trackByIso(_: number, cell: DayCell): string { return cell.iso; }

  private emit(checkIn: string | null, checkOut: string | null): void {
    this.checkIn = checkIn;
    this.checkOut = checkOut;
    this.rebuild();
    this.rangeChange.emit({ checkIn, checkOut });
  }

  private rangeOverlapsBlocked(start: Date, end: Date): boolean {
    return this.blockedRanges.some(range => {
      const rStart = this.parseIso(range.checkIn);
      const rEnd = this.parseIso(range.checkOut);
      if (!rStart || !rEnd) return false;
      // تداخل نصف مفتوح [start,end) مع [rStart,rEnd)
      return start.getTime() < rEnd.getTime() && rStart.getTime() < end.getTime();
    });
  }

  private isDateBlocked(date: Date): boolean {
    return this.blockedRanges.some(range => {
      const rStart = this.parseIso(range.checkIn);
      const rEnd = this.parseIso(range.checkOut);
      if (!rStart || !rEnd) return false;
      return date.getTime() >= rStart.getTime() && date.getTime() < rEnd.getTime();
    });
  }

  private parseIso(iso: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  private rebuild(): void {
    const month = this.viewMonth();
    const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const startOffset = firstOfMonth.getDay(); // 0=Sunday
    const gridStart = new Date(firstOfMonth.getTime() - startOffset * DAY_MS);

    const cells: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const isPast = date.getTime() < this.today.getTime() || date.getTime() > this.maxDate.getTime();
      cells.push({
        date,
        iso: toIso(date),
        inCurrentMonth: date.getMonth() === month.getMonth(),
        isPast,
        isBlocked: !isPast && this.isDateBlocked(date),
        isToday: date.getTime() === this.today.getTime()
      });
    }

    this.weeks = [];
    for (let w = 0; w < 6; w++) {
      this.weeks.push(cells.slice(w * 7, w * 7 + 7));
    }
  }
}
