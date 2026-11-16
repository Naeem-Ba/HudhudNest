// src/app/features/agency-form/agency-branches-panel.component.ts
//
// فروع المكتب في «مكتبي العقاري» (للمالك فقط؛ الخادم يتحقق من الملكية في كل نداء):
// إضافة وتعديل وحذف، وفرع رئيسي واحد دائمًا (أول فرع يصير رئيسيًا تلقائيًا). المكان: محافظة إلزامية ثم منطقة
// وحي اختياريان، بنفس القوائم المستعملة في نموذج المكتب. الموقع على الخريطة اختياري، لكنه شرط ظهور المكتب في
// «القريبة مني» وعلى خريطة المكاتب. لا دبوس افتراضي: لا نضع المكتب في مركز المحافظة نيابة عن صاحبه.
import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { apiErrorText } from '../../core/api/api-error-text';
import { LookupsApiService, StructuredLocationLookup, pickLocalizedName } from '../../core/api/lookups-api.service';
import { AGENCY_BRANCH_LIMIT, Agency, AgencyBranch, AgencyBranchInput } from '../../core/models/agency.model';
import { LanguageService } from '../../core/services/language.service';
import { ToastService } from '../../shared/services/toast.service';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';
import { MapPickerComponent } from '../../map-picker/map-picker.component';

interface BranchDraft {
  name: string;
  governorateId: number | null;
  districtId: number | null;
  neighborhoodId: number | null;
  address: string;
  contactPhone: string;
  pin: { lat: number; lng: number } | null;
  isMain: boolean;
}

function emptyDraft(agency: Agency): BranchDraft {
  return {
    name: '', governorateId: agency.governorateId ?? null, districtId: null, neighborhoodId: null,
    address: '', contactPhone: '', pin: null, isMain: false
  };
}

/** The request body from the draft; empty text becomes null. Exported for the spec. */
export function toBranchInput(draft: BranchDraft): AgencyBranchInput {
  return {
    name: draft.name.trim(),
    governorateId: draft.governorateId ?? 0,
    districtId: draft.districtId,
    neighborhoodId: draft.districtId ? draft.neighborhoodId : null,
    address: draft.address.trim() || null,
    contactPhone: draft.contactPhone.trim() || null,
    latitude: draft.pin ? Math.round(draft.pin.lat * 1e6) / 1e6 : null,
    longitude: draft.pin ? Math.round(draft.pin.lng * 1e6) / 1e6 : null,
    isMain: draft.isMain
  };
}

@Component({
  selector: 'app-agency-branches-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, ConfirmModalComponent, MapPickerComponent],
  styleUrl: './agency-panels.scss',
  template: `
    <section class="panel" data-testid="branches-panel">
      <div class="panel__header">
        <h2 class="panel__title">{{ 'AGENCY_BRANCHES.TITLE' | translate }}</h2>
        <p class="panel__desc">{{ 'AGENCY_BRANCHES.DESC' | translate }}</p>
      </div>
      <div class="panel__body">
        <p class="muted" *ngIf="branches().length === 0 && !editing()">{{ 'AGENCY_BRANCHES.EMPTY' | translate }}</p>

        <ul class="branch-list" *ngIf="branches().length > 0">
          <li class="branch-row" *ngFor="let b of branches(); trackBy: trackById" data-testid="branch-row">
            <div class="branch-row__main">
              <strong><bdi>{{ b.name }}</bdi></strong>
              <span class="branch-badge" *ngIf="b.isMain">{{ 'AGENCY_BRANCHES.MAIN' | translate }}</span>
              <span class="branch-row__meta">{{ placeName(b) }}<ng-container *ngIf="b.address"> · {{ b.address }}</ng-container></span>
              <span class="branch-row__meta" [class.branch-row__warn]="b.latitude == null">
                {{ (b.latitude != null ? 'AGENCY_BRANCHES.ON_MAP' : 'AGENCY_BRANCHES.NOT_ON_MAP') | translate }}
              </span>
            </div>
            <div class="branch-row__actions">
              <button type="button" class="btn btn--outline btn--sm" (click)="startEdit(b)" [disabled]="busy()">{{ 'COMMON.EDIT' | translate }}</button>
              <button type="button" class="btn btn--ghost btn--sm" (click)="askDelete(b)" [disabled]="busy()">{{ 'COMMON.DELETE' | translate }}</button>
            </div>
          </li>
        </ul>

        <button type="button" class="btn btn--outline btn--sm" data-testid="add-branch"
                *ngIf="!editing() && branches().length < limit" (click)="startAdd()">
          + {{ 'AGENCY_BRANCHES.ADD' | translate }}
        </button>
        <p class="muted" *ngIf="branches().length >= limit">{{ 'AGENCY_BRANCHES.LIMIT' | translate: { max: limit } }}</p>

        <form class="branch-form" *ngIf="editing() && draft as d" (ngSubmit)="save()" data-testid="branch-form">
          <label>
            {{ 'AGENCY_BRANCHES.NAME' | translate }} *
            <input type="text" name="name" [(ngModel)]="d.name" maxlength="100" required />
          </label>

          <div class="branch-form__row">
            <label>
              {{ 'AGENCY_BRANCHES.GOVERNORATE' | translate }} *
              <select name="governorateId" [ngModel]="d.governorateId" (ngModelChange)="onGovernorate($event)" required>
                <option [ngValue]="null" disabled>{{ 'AGENCY_BRANCHES.CHOOSE' | translate }}</option>
                <option *ngFor="let g of governorates()" [ngValue]="g.id">{{ name(g) }}</option>
              </select>
            </label>
            <label>
              {{ 'AGENCY_BRANCHES.DISTRICT' | translate }}
              <select name="districtId" [ngModel]="d.districtId" (ngModelChange)="onDistrict($event)" [disabled]="!d.governorateId">
                <option [ngValue]="null">{{ 'AGENCY_BRANCHES.OPTIONAL' | translate }}</option>
                <option *ngFor="let x of districts()" [ngValue]="x.id">{{ name(x) }}</option>
              </select>
            </label>
            <label>
              {{ 'AGENCY_BRANCHES.NEIGHBORHOOD' | translate }}
              <select name="neighborhoodId" [(ngModel)]="d.neighborhoodId" [disabled]="!d.districtId">
                <option [ngValue]="null">{{ 'AGENCY_BRANCHES.OPTIONAL' | translate }}</option>
                <option *ngFor="let n of neighborhoods()" [ngValue]="n.id">{{ name(n) }}</option>
              </select>
            </label>
          </div>

          <label>
            {{ 'AGENCY_BRANCHES.ADDRESS' | translate }}
            <input type="text" name="address" [(ngModel)]="d.address" maxlength="300" />
          </label>
          <label>
            {{ 'AGENCY_BRANCHES.PHONE' | translate }}
            <input type="tel" name="contactPhone" [(ngModel)]="d.contactPhone" maxlength="30" dir="ltr" inputmode="tel" />
          </label>

          <div class="branch-form__map">
            <p class="panel__subtitle">{{ 'AGENCY_BRANCHES.PIN' | translate }}</p>
            <p class="muted">{{ 'AGENCY_BRANCHES.PIN_HINT' | translate }}</p>
            <app-map-picker [lang]="lang()" [marker]="d.pin" [searchable]="true" (locationChange)="d.pin = $event"></app-map-picker>
            <button type="button" class="btn btn--ghost btn--sm" *ngIf="d.pin" (click)="d.pin = null">
              {{ 'AGENCY_BRANCHES.CLEAR_PIN' | translate }}
            </button>
          </div>

          <label class="branch-form__check" *ngIf="!editingBranch()?.isMain && branches().length > 0">
            <input type="checkbox" name="isMain" [(ngModel)]="d.isMain" />
            {{ 'AGENCY_BRANCHES.MAKE_MAIN' | translate }}
          </label>

          <div class="branch-form__actions">
            <button type="submit" class="btn btn--primary btn--sm" [disabled]="busy() || !d.name.trim() || !d.governorateId">
              {{ (busy() ? 'COMMON.SAVING' : 'COMMON.SAVE') | translate }}
            </button>
            <button type="button" class="btn btn--ghost btn--sm" (click)="cancel()" [disabled]="busy()">{{ 'COMMON.CANCEL' | translate }}</button>
          </div>
        </form>
      </div>
    </section>

    <app-confirm-modal
      [open]="!!deleting()"
      [title]="'AGENCY_BRANCHES.DELETE_TITLE' | translate"
      [confirmLabel]="'COMMON.DELETE' | translate"
      [danger]="true"
      [loading]="busy()"
      (confirmed)="confirmDelete()"
      (cancelled)="deleting.set(null)"
    >
      <p>{{ 'AGENCY_BRANCHES.DELETE_TEXT' | translate: { name: deleting()?.name } }}</p>
    </app-confirm-modal>
  `,
  styles: [`
    .branch-list { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-direction: column; gap: .6rem; }
    .branch-row { display: flex; justify-content: space-between; gap: .75rem; flex-wrap: wrap; padding: .75rem; border: 1px solid var(--border); border-radius: var(--r-md); }
    .branch-row__main { display: flex; flex-direction: column; gap: .2rem; min-width: 0; flex: 1 1 220px; }
    .branch-row__meta { font-size: .8rem; color: var(--gray-500); overflow-wrap: anywhere; }
    .branch-row__warn { color: var(--warning-text); }
    .branch-row__actions { display: flex; gap: .4rem; align-items: flex-start; }
    .branch-badge { align-self: flex-start; padding: .05rem .5rem; border-radius: 999px; background: var(--primary-soft); color: var(--primary-text); font-size: .72rem; font-weight: 700; }
    .branch-form { display: flex; flex-direction: column; gap: .8rem; margin-top: 1rem; }
    .branch-form label { display: flex; flex-direction: column; gap: .3rem; font-size: .85rem; font-weight: 600; color: var(--gray-700); min-width: 0; }
    .branch-form input[type=text], .branch-form input[type=tel], .branch-form select {
      border: 1px solid var(--border); border-radius: var(--r-sm); padding: .5rem .6rem; background: var(--surface);
      color: var(--text-strong); font: inherit; font-size: 16px; min-width: 0;
    }
    .branch-form__row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: .75rem; }
    .branch-form__check { flex-direction: row !important; align-items: center; gap: .5rem; }
    .branch-form__actions { display: flex; gap: .5rem; flex-wrap: wrap; }
    .muted { color: var(--gray-500); font-size: .85rem; margin: 0 0 .5rem; }
  `]
})
export class AgencyBranchesPanelComponent implements OnInit {
  private readonly api = inject(AgenciesApiService);
  private readonly lookups = inject(LookupsApiService);
  private readonly language = inject(LanguageService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) agency!: Agency;
  /** Emitted after every change, with the office's branches as the server now has them. */
  @Output() branchesChanged = new EventEmitter<AgencyBranch[]>();

  readonly limit = AGENCY_BRANCH_LIMIT;
  readonly branches = signal<AgencyBranch[]>([]);
  readonly governorates = signal<StructuredLocationLookup[]>([]);
  readonly districts = signal<StructuredLocationLookup[]>([]);
  readonly neighborhoods = signal<StructuredLocationLookup[]>([]);
  readonly editing = signal(false);
  readonly editingBranch = signal<AgencyBranch | null>(null);
  readonly deleting = signal<AgencyBranch | null>(null);
  readonly busy = signal(false);
  readonly lang = signal(this.language.getCurrent());

  draft: BranchDraft | null = null;
  private allDistricts = new Map<number, StructuredLocationLookup[]>();

  ngOnInit(): void {
    this.branches.set(this.agency.branches ?? []);
    this.language.currentLang$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(l => this.lang.set(l));
    this.lookups.getGovernorates().pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.governorates.set(list));
    // District names for the list rows (one request per governorate in use).
    new Set((this.agency.branches ?? []).map(b => b.governorateId)).forEach(id => this.loadDistrictNames(id));
  }

  name(item: StructuredLocationLookup): string {
    return pickLocalizedName(item, this.lang());
  }

  placeName(branch: AgencyBranch): string {
    const gov = this.governorates().find(g => g.id === branch.governorateId);
    const district = this.allDistricts.get(branch.governorateId)?.find(d => d.id === branch.districtId);
    return [district, gov].filter((p): p is StructuredLocationLookup => !!p).map(p => this.name(p))
      .join(this.lang() === 'ar' ? '، ' : ', ');
  }

  startAdd(): void {
    this.draft = emptyDraft(this.agency);
    this.editingBranch.set(null);
    this.loadDistricts(this.draft.governorateId);
    this.neighborhoods.set([]);
    this.editing.set(true);
  }

  startEdit(branch: AgencyBranch): void {
    this.draft = {
      name: branch.name, governorateId: branch.governorateId, districtId: branch.districtId ?? null,
      neighborhoodId: branch.neighborhoodId ?? null, address: branch.address ?? '', contactPhone: branch.contactPhone ?? '',
      pin: branch.latitude != null && branch.longitude != null ? { lat: branch.latitude, lng: branch.longitude } : null,
      isMain: branch.isMain
    };
    this.editingBranch.set(branch);
    this.loadDistricts(branch.governorateId);
    this.loadNeighborhoods(branch.districtId ?? null);
    this.editing.set(true);
  }

  cancel(): void {
    this.editing.set(false);
    this.editingBranch.set(null);
    this.draft = null;
  }

  onGovernorate(id: number | null): void {
    if (!this.draft) return;
    this.draft.governorateId = id;
    this.draft.districtId = null;
    this.draft.neighborhoodId = null;
    this.loadDistricts(id);
    this.neighborhoods.set([]);
  }

  onDistrict(id: number | null): void {
    if (!this.draft) return;
    this.draft.districtId = id;
    this.draft.neighborhoodId = null;
    this.loadNeighborhoods(id);
  }

  save(): void {
    if (!this.draft || this.busy() || !this.draft.name.trim() || !this.draft.governorateId) return;
    const body = toBranchInput(this.draft);
    const editing = this.editingBranch();
    const request$ = editing
      ? this.api.updateBranch(this.agency.id, editing.id, body)
      : this.api.addBranch(this.agency.id, body);

    this.busy.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => {
        this.apply(list);
        this.toast.success(this.translate.instant('AGENCY_BRANCHES.SAVED'));
        this.cancel();
      },
      error: err => {
        this.busy.set(false);
        this.toast.error(apiErrorText(err) ?? this.translate.instant('AGENCY_BRANCHES.SAVE_ERROR'));
      }
    });
  }

  askDelete(branch: AgencyBranch): void {
    this.deleting.set(branch);
  }

  confirmDelete(): void {
    const branch = this.deleting();
    if (!branch || this.busy()) return;
    this.busy.set(true);
    this.api.deleteBranch(this.agency.id, branch.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => {
        this.apply(list);
        this.deleting.set(null);
        this.toast.success(this.translate.instant('AGENCY_BRANCHES.DELETED'));
      },
      error: err => {
        this.busy.set(false);
        this.toast.error(apiErrorText(err) ?? this.translate.instant('AGENCY_BRANCHES.SAVE_ERROR'));
      }
    });
  }

  trackById(_: number, branch: AgencyBranch): string {
    return branch.id;
  }

  private apply(list: AgencyBranch[]): void {
    this.busy.set(false);
    this.branches.set(list);
    new Set(list.map(b => b.governorateId)).forEach(id => this.loadDistrictNames(id));
    this.branchesChanged.emit(list);
  }

  private loadDistricts(governorateId: number | null): void {
    if (!governorateId) {
      this.districts.set([]);
      return;
    }
    const cached = this.allDistricts.get(governorateId);
    if (cached) {
      this.districts.set(cached);
      return;
    }
    this.lookups.getDistricts(governorateId).pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe(list => {
        this.allDistricts.set(governorateId, list);
        this.districts.set(list);
      });
  }

  private loadDistrictNames(governorateId: number): void {
    if (this.allDistricts.has(governorateId)) return;
    this.lookups.getDistricts(governorateId).pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe(list => {
        this.allDistricts.set(governorateId, list);
        this.branches.set([...this.branches()]);
      });
  }

  private loadNeighborhoods(districtId: number | null): void {
    if (!districtId) {
      this.neighborhoods.set([]);
      return;
    }
    this.lookups.getNeighborhoods(districtId).pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.neighborhoods.set(list));
  }
}
