import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { Property } from '../../core/models/property.model';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import {
  OWNER_SELECTABLE_STATUSES,
  OwnerSelectableStatus,
  listingLifecycle,
  ownerSelectableStatusesFor
} from '../../shared/utils/listing-status';

/**
 * Status control on the listing's own page (listing status control, 2026-11-18): Reserved, back to
 * Available, Sold / Rented, Archived. Shown to the publisher, and to the owner of the listing's office while
 * the publisher is a member of it (owner decision the same day: the office owner may change the status of
 * an agent's listing, nothing else). The server makes the same check; this only decides what to show.
 */
@Component({
  selector: 'app-listing-status-panel',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canManage() && current(); as currentStatus) {
      <div class="listing-status-panel" data-testid="listing-status-panel">
        <label class="listing-status-panel__label" [for]="selectId()">{{ 'LISTING_STATUS.OWNER_LABEL' | translate }}</label>
        <select
          class="listing-status-panel__select"
          [id]="selectId()"
          [disabled]="saving()"
          (change)="change($any($event.target))"
          data-testid="listing-status-select"
        >
          @for (status of options(); track status) {
            <option [value]="status" [selected]="status === currentStatus">{{ optionKey(status) | translate }}</option>
          }
        </select>
        @if (asOfficeOwner()) {
          <p class="listing-status-panel__hint" data-testid="listing-status-office-hint">{{ 'LISTING_STATUS.OFFICE_OWNER_HINT' | translate }}</p>
        }
      </div>
    }
  `,
  styles: [`
    .listing-status-panel { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; width: 100%; }
    .listing-status-panel__label { font-weight: 600; }
    .listing-status-panel__select { min-height: 44px; padding: 0 .75rem; border-radius: 8px; border: 1px solid var(--border-color, #d0d5dd); background: var(--surface, #fff); color: inherit; }
    .listing-status-panel__hint { flex-basis: 100%; margin: 0; font-size: .85rem; opacity: .8; }
  `]
})
export class ListingStatusPanelComponent {
  readonly property = input.required<Property>();
  readonly statusChanged = output<OwnerSelectableStatus>();

  private readonly auth = inject(AuthService);
  private readonly agencies = inject(AgenciesApiService);
  private readonly api = inject(PropertyApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly saving = signal(false);
  /** Set once /agencies/me answered that the viewer owns this listing's office and the publisher is a member. */
  readonly asOfficeOwner = signal(false);

  private readonly isPublisher = computed(() => {
    const me = this.auth.getCurrentUserId();
    return !!me && this.property().ownerId === me;
  });

  readonly canManage = computed(() =>
    !!this.property().id && this.property().isPublished === true && (this.isPublisher() || this.asOfficeOwner()));

  readonly current = computed<OwnerSelectableStatus | null>(() => {
    const lifecycle = listingLifecycle(this.property());
    return OWNER_SELECTABLE_STATUSES.find(s => s.toLowerCase() === lifecycle) ?? null;
  });

  readonly options = computed(() => ownerSelectableStatusesFor(this.property()));
  readonly selectId = computed(() => `listing-status-${this.property().id}`);

  private checkedAgencyFor: string | null = null;

  constructor() {
    // Only a signed-in viewer who is not the publisher, on a listing that names an office, costs one request.
    effect(() => {
      const p = this.property();
      const me = this.auth.getCurrentUserId();
      const agencyId = p.agencyId;
      if (!me || !agencyId || p.ownerId === me || this.checkedAgencyFor === `${p.id}:${agencyId}`) {
        return;
      }
      this.checkedAgencyFor = `${p.id}:${agencyId}`;

      this.agencies.getMine()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: agency => this.asOfficeOwner.set(
            !!agency &&
            agency.id === agencyId &&
            agency.ownerUserId === me &&
            (agency.members ?? []).some(m => m.userId === p.ownerId)
          ),
          error: () => this.asOfficeOwner.set(false)
        });
    });
  }

  optionKey(status: OwnerSelectableStatus): string {
    return `LISTING_STATUS.${status.toUpperCase()}`;
  }

  change(select: HTMLSelectElement): void {
    const id = this.property().id;
    const next = select.value as OwnerSelectableStatus;
    const current = this.current();

    if (!id || this.saving() || !OWNER_SELECTABLE_STATUSES.includes(next) || next === current) {
      return;
    }

    const confirmKey = next === 'Sold' || next === 'Rented'
      ? 'LISTING_STATUS.CONFIRM_CLOSED'
      : next === 'Archived' ? 'LISTING_STATUS.CONFIRM_ARCHIVED' : null;

    if (confirmKey && !confirm(this.translate.instant(confirmKey))) {
      select.value = current ?? 'Available';
      return;
    }

    this.saving.set(true);
    this.api.updateStatus(id, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.show(this.translate.instant('LISTING_STATUS.CHANGED'), 'success');
          this.statusChanged.emit(next);
        },
        error: () => {
          this.saving.set(false);
          select.value = current ?? 'Available';
          this.toast.show(this.translate.instant('LISTING_STATUS.CHANGE_ERROR'), 'error');
        }
      });
  }
}
