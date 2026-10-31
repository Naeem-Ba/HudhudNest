// لوحة إتاحة وحدة واحدة للمضيف (قرار المالك 2026-10-18: المضيف يتحكم بالتوفر):
//   - مفتاح «متاح حاليًا / غير متاح حاليًا» للوحدة كلها (PUT .../units/{id}/availability) — الحجوزات القائمة لا تتأثر.
//   - فترات محجوبة (أيام/فترات محجوزة أو غير متاحة): عرض وحذف وإضافة (to حصري: صباح عودة الوحدة).
// كل تغيير يُحفظ فورًا على الخادم، لا يمرّ بزر «حفظ» نموذج الإعلان. رسالة الرفض (409 تقاطع مع حجز أو فترة،
// 422 نطاق غير صالح) تُعرض كما يرسلها الخادم.
import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { apiErrorText } from '../../../core/api/api-error-text';
import { ToastService } from '../../../shared/services/toast.service';
import { AccommodationUnitDto, UnitBlockDto, validateUnitBlockRange } from '../../../core/models/short-stay.model';

/** "yyyy-MM-dd" of the device's current day (the blocks are calendar days, not instants). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

@Component({
  selector: 'app-unit-availability-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  templateUrl: './unit-availability-panel.component.html',
  styleUrls: ['./unit-availability-panel.component.scss']
})
export class UnitAvailabilityPanelComponent implements OnInit {
  private readonly api = inject(ShortStayListingApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) unit!: AccommodationUnitDto;
  /** Shown above the unit label when the listing has more than one room type. */
  @Input() roomTypeName: string | null = null;

  readonly isActive = signal(true);
  readonly togglingActive = signal(false);

  readonly blocks = signal<UnitBlockDto[]>([]);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);
  readonly removingId = signal<string | null>(null);

  readonly from = signal('');
  readonly to = signal('');
  readonly adding = signal(false);
  /** The reason the last add was refused: the API's own sentence, or a local range check. */
  readonly addError = signal('');
  readonly today = signal(todayIso());

  ngOnInit(): void {
    this.isActive.set(this.unit.isActive);
    this.loadBlocks();
  }

  loadBlocks(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.api.getUnitBlocks(this.unit.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blocks => {
        this.blocks.set([...blocks].sort((a, b) => a.from.localeCompare(b.from)));
        this.loading.set(false);
      },
      error: () => { this.loadFailed.set(true); this.loading.set(false); }
    });
  }

  setActive(active: boolean): void {
    if (this.togglingActive() || active === this.isActive()) return;

    this.togglingActive.set(true);
    this.api.setUnitAvailability(this.unit.id, active).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: unit => {
        this.isActive.set(unit?.isActive ?? active);
        this.togglingActive.set(false);
        this.toast.show(this.translate.instant('SHORTSTAY.AVAILABILITY.TOGGLE_SUCCESS'), 'success');
      },
      error: err => {
        this.togglingActive.set(false);
        this.toast.show(apiErrorText(err) ?? this.translate.instant('SHORTSTAY.AVAILABILITY.TOGGLE_ERROR'), 'error');
      }
    });
  }

  onFrom(event: Event): void { this.from.set((event.target as HTMLInputElement).value); this.addError.set(''); }
  onTo(event: Event): void { this.to.set((event.target as HTMLInputElement).value); this.addError.set(''); }

  addBlock(): void {
    if (this.adding()) return;

    const invalid = validateUnitBlockRange(this.from(), this.to(), this.today());
    if (invalid) {
      this.addError.set(this.translate.instant(invalid));
      return;
    }

    this.adding.set(true);
    this.addError.set('');

    this.api.addUnitBlock(this.unit.id, { from: this.from(), to: this.to() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: block => {
          this.blocks.update(items => [...items, block].sort((a, b) => a.from.localeCompare(b.from)));
          this.from.set('');
          this.to.set('');
          this.adding.set(false);
          this.toast.show(this.translate.instant('SHORTSTAY.AVAILABILITY.ADD_SUCCESS'), 'success');
        },
        error: err => {
          this.adding.set(false);
          this.addError.set(apiErrorText(err) ?? this.translate.instant('SHORTSTAY.AVAILABILITY.ADD_ERROR'));
        }
      });
  }

  removeBlock(block: UnitBlockDto): void {
    if (this.removingId()) return;

    this.removingId.set(block.id);
    this.api.removeUnitBlock(this.unit.id, block.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.blocks.update(items => items.filter(item => item.id !== block.id));
        this.removingId.set(null);
      },
      error: err => {
        this.removingId.set(null);
        this.toast.show(apiErrorText(err) ?? this.translate.instant('SHORTSTAY.AVAILABILITY.REMOVE_ERROR'), 'error');
      }
    });
  }

  trackById(_: number, block: UnitBlockDto): string {
    return block.id;
  }
}
