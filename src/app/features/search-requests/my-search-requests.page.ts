import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  SearchRequest, SearchRequestApiService, SearchRequestInput, SearchRequestMatch
} from '../../core/api/search-request-api.service';
import { LookupsApiService, PropertyTypeLookup, StructuredLocationLookup, pickLocalizedName } from '../../core/api/lookups-api.service';
import { currentUiLanguage } from '../../core/i18n/ui-language';
import { ToastService } from '../../shared/services/toast.service';
import { formatListingPrice } from '../../shared/utils/listing-price';
import { SearchRequestSummaryComponent } from './search-request-summary.component';
import { ComboBoxComponent, ComboOption } from '../../shared/ui/combo-box.component';
import { PlaceProposalService } from '../../core/api/place-proposal.service';

const emptyForm = (): SearchRequestInput => ({
  listingType: 'ForRent', governorateId: 0, districtId: null, propertyTypeId: null,
  minBudget: null, maxBudget: 0, currencyCode: 'USD', minRooms: null, minArea: null, maxArea: null,
  needsBalcony: false, needsElevator: false, needsParking: false, needsFurnished: false, details: '', expiresAt: null
});

/**
 * "My search requests" (growth engine P2): create, edit, pause, resume, close and renew a request, and see
 * the listings the matcher or advertisers suggested for it. Nothing here exposes other users.
 */
@Component({
  selector: 'app-my-search-requests',
  standalone: true,
  imports: [FormsModule, RouterModule, TranslateModule, ComboBoxComponent, SearchRequestSummaryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="sr-page container">
      <header class="sr-page__header">
        <h1>{{ 'SEARCH_REQUESTS.TITLE' | translate }}</h1>
        <p class="sr-page__lead">{{ 'SEARCH_REQUESTS.LEAD' | translate }}</p>
        @if (!editing()) {
          <button type="button" class="btn btn-primary" (click)="startCreate()" data-testid="sr-new">{{ 'SEARCH_REQUESTS.NEW' | translate }}</button>
        }
      </header>

      @if (editing()) {
        <form class="sr-form card" (ngSubmit)="save()" #f="ngForm" data-testid="sr-form" novalidate>
          <h2>{{ (editingId() ? 'SEARCH_REQUESTS.EDIT' : 'SEARCH_REQUESTS.NEW') | translate }}</h2>

          <fieldset class="sr-form__row">
            <legend>{{ 'SEARCH_REQUESTS.TYPE' | translate }}</legend>
            <label><input type="radio" name="listingType" value="ForRent" [(ngModel)]="form.listingType"> {{ 'SEARCH_REQUESTS.TYPE_RENT' | translate }}</label>
            <label><input type="radio" name="listingType" value="ForSale" [(ngModel)]="form.listingType"> {{ 'SEARCH_REQUESTS.TYPE_BUY' | translate }}</label>
          </fieldset>

          <div class="sr-form__grid">
            <label>{{ 'SEARCH_REQUESTS.GOVERNORATE' | translate }} *
              <select name="governorateId" [(ngModel)]="form.governorateId" (ngModelChange)="onGovernorate($event)" required>
                <option [ngValue]="0" disabled>—</option>
                @for (g of governorates(); track g.id) { <option [ngValue]="g.id">{{ name(g) }}</option> }
              </select>
            </label>
            <div class="sr-form__field">
              <label for="sr-district">{{ 'SEARCH_REQUESTS.DISTRICT' | translate }}</label>
              <app-combo-box
                inputId="sr-district"
                name="districtId"
                [options]="districtOptions()"
                [allowCustom]="true"
                [customValue]="districtText"
                [disabled]="!form.governorateId"
                [(ngModel)]="form.districtId"
                (customText)="onDistrictTyped($event)"
                [placeholder]="'SEARCH_REQUESTS.ANY' | translate"
              ></app-combo-box>
              @if (districtText.trim()) {
                <small class="sr-form__note" role="status">
                  {{ (canProposePlaces ? 'GEO.TYPED_PLACE_PROPOSED' : 'GEO.TYPED_PLACE_NOT_SAVED') | translate: { value: districtText.trim() } }}
                </small>
              }
            </div>
            <label>{{ 'SEARCH_REQUESTS.PROPERTY_TYPE' | translate }}
              <select name="propertyTypeId" [(ngModel)]="form.propertyTypeId">
                <option [ngValue]="null">{{ 'SEARCH_REQUESTS.ANY' | translate }}</option>
                @for (t of propertyTypes(); track t.id) { <option [ngValue]="t.id">{{ name(t) }}</option> }
              </select>
            </label>
            <label>{{ 'SEARCH_REQUESTS.CURRENCY' | translate }}
              <select name="currencyCode" [(ngModel)]="form.currencyCode">
                <option value="USD">USD</option><option value="EUR">EUR</option><option value="SYP">SYP</option>
              </select>
            </label>
            <label>{{ 'SEARCH_REQUESTS.MIN_BUDGET' | translate }}
              <input type="number" inputmode="decimal" min="0" name="minBudget" [(ngModel)]="form.minBudget">
            </label>
            <label>{{ 'SEARCH_REQUESTS.MAX_BUDGET' | translate }} *
              <input type="number" inputmode="decimal" min="1" name="maxBudget" [(ngModel)]="form.maxBudget" required>
            </label>
            <label>{{ 'SEARCH_REQUESTS.MIN_ROOMS' | translate }}
              <input type="number" inputmode="numeric" min="0" max="50" name="minRooms" [(ngModel)]="form.minRooms">
            </label>
            <label>{{ 'SEARCH_REQUESTS.MIN_AREA' | translate }}
              <input type="number" inputmode="decimal" min="0" name="minArea" [(ngModel)]="form.minArea">
            </label>
            <label>{{ 'SEARCH_REQUESTS.MAX_AREA' | translate }}
              <input type="number" inputmode="decimal" min="0" name="maxArea" [(ngModel)]="form.maxArea">
            </label>
            <label>{{ 'SEARCH_REQUESTS.EXPIRES' | translate }}
              <input type="date" name="expiresAt" [(ngModel)]="expiresDate" [min]="today" [max]="maxDate">
            </label>
          </div>

          <fieldset class="sr-form__row">
            <legend>{{ 'SEARCH_REQUESTS.FEATURES' | translate }}</legend>
            <label><input type="checkbox" name="needsBalcony" [(ngModel)]="form.needsBalcony"> {{ 'PROPERTY.HAS_BALCONY' | translate }}</label>
            <label><input type="checkbox" name="needsElevator" [(ngModel)]="form.needsElevator"> {{ 'PROPERTY.HAS_ELEVATOR' | translate }}</label>
            <label><input type="checkbox" name="needsParking" [(ngModel)]="form.needsParking"> {{ 'PROPERTY.HAS_PARKING' | translate }}</label>
            <label><input type="checkbox" name="needsFurnished" [(ngModel)]="form.needsFurnished"> {{ 'SEARCH_REQUESTS.FURNISHED' | translate }}</label>
          </fieldset>

          <label class="sr-form__details">{{ 'SEARCH_REQUESTS.DETAILS' | translate }}
            <textarea name="details" rows="3" maxlength="500" [(ngModel)]="form.details"></textarea>
            <small>{{ 'SEARCH_REQUESTS.DETAILS_HINT' | translate }}</small>
          </label>

          <p class="sr-form__privacy">{{ 'SEARCH_REQUESTS.PRIVACY' | translate }}</p>

          <div class="sr-form__actions">
            <button type="submit" class="btn btn-primary" [disabled]="saving() || !form.governorateId || !(form.maxBudget > 0)">{{ 'COMMON.SAVE' | translate }}</button>
            <button type="button" class="btn btn-secondary" (click)="cancel()">{{ 'COMMON.CANCEL' | translate }}</button>
          </div>
        </form>
      }

      @if (loading()) {
        <p role="status">{{ 'COMMON.LOADING' | translate }}</p>
      } @else if (!requests().length && !editing()) {
        <p class="sr-empty" data-testid="sr-empty">{{ 'SEARCH_REQUESTS.EMPTY' | translate }}</p>
      }

      <ul class="sr-list">
        @for (r of requests(); track r.id) {
          <li class="sr-card card" data-testid="sr-item">
            <div class="sr-card__top">
              <span class="sr-status sr-status--{{ r.status.toLowerCase() }}">{{ ('SEARCH_REQUESTS.STATUS.' + r.status) | translate }}</span>
              <span class="sr-card__date">{{ 'SEARCH_REQUESTS.EXPIRES_ON' | translate }} {{ date(r.expiresAt) }}</span>
            </div>
            <app-search-request-summary [request]="r" [governorates]="governorates()" />
            <div class="sr-card__actions">
              <button type="button" class="btn btn-link" (click)="toggleMatches(r)" [attr.aria-expanded]="openId() === r.id">
                {{ 'SEARCH_REQUESTS.MATCHES' | translate: { count: r.matchCount } }}
              </button>
              @if (r.status === 'Active' || r.status === 'Paused') {
                <button type="button" class="btn btn-link" (click)="startEdit(r)">{{ 'COMMON.EDIT' | translate }}</button>
              }
              @if (r.status === 'Active') { <button type="button" class="btn btn-link" (click)="act(r, 'pause')">{{ 'SEARCH_REQUESTS.PAUSE' | translate }}</button> }
              @if (r.status === 'Paused') { <button type="button" class="btn btn-link" (click)="act(r, 'resume')">{{ 'SEARCH_REQUESTS.RESUME' | translate }}</button> }
              @if (r.status === 'Expired') { <button type="button" class="btn btn-link" (click)="act(r, 'renew')">{{ 'SEARCH_REQUESTS.RENEW' | translate }}</button> }
              @if (r.status !== 'Closed') { <button type="button" class="btn btn-link" (click)="act(r, 'close')">{{ 'SEARCH_REQUESTS.CLOSE' | translate }}</button> }
            </div>
            @if (openId() === r.id) {
              <ul class="sr-matches" data-testid="sr-matches">
                @for (m of matches(); track m.propertyId) {
                  <li class="sr-match">
                    <a [routerLink]="['/properties', m.propertyId]" class="sr-match__link">
                      @if (m.mainImageUrl) { <img [src]="m.mainImageUrl" alt="" width="72" height="54" loading="lazy"> }
                      <span class="sr-match__title">{{ m.title }}</span>
                    </a>
                    <span class="sr-match__price" dir="ltr">{{ price(m) }}</span>
                    <span class="sr-match__score">{{ 'SEARCH_REQUESTS.SCORE' | translate: { score: m.score } }}</span>
                    @if (m.source === 'Proposed') { <span class="sr-match__badge">{{ 'SEARCH_REQUESTS.PROPOSED' | translate }}</span> }
                    <span class="sr-match__reasons">
                      @for (code of m.reasons; track code) { <span class="sr-reason">{{ ('SEARCH_REQUESTS.REASON.' + code) | translate }}</span> }
                    </span>
                  </li>
                } @empty {
                  <li>{{ 'SEARCH_REQUESTS.NO_MATCHES' | translate }}</li>
                }
              </ul>
            }
          </li>
        }
      </ul>
    </main>
  `,
  styleUrls: ['./search-requests.scss']
})
export class MySearchRequestsPage implements OnInit {
  private readonly api = inject(SearchRequestApiService);
  private readonly lookups = inject(LookupsApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly requests = signal<SearchRequest[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly editing = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly openId = signal<string | null>(null);
  readonly matches = signal<SearchRequestMatch[]>([]);
  readonly governorates = signal<StructuredLocationLookup[]>([]);
  readonly districts = signal<StructuredLocationLookup[]>([]);
  readonly propertyTypes = signal<PropertyTypeLookup[]>([]);

  /** Resolved on first use: only a typed place needs it, and the page renders without the catalog otherwise. */
  private readonly injector = inject(Injector);
  private get placeProposals(): PlaceProposalService {
    return this.injector.get(PlaceProposalService);
  }
  readonly districtOptions = computed<ComboOption[]>(() =>
    this.districts().map(d => ({ value: d.id, label: this.name(d) })));
  /**
   * A district typed because it is not in the list. A request only holds the district id, so the name is proposed to
   * the administrators and the request stays on the governorate (or the district already chosen).
   */
  districtText = '';

  form: SearchRequestInput = emptyForm();
  expiresDate = '';
  readonly today = new Date().toISOString().slice(0, 10);
  readonly maxDate = new Date(Date.now() + 89 * 86_400_000).toISOString().slice(0, 10);

  ngOnInit(): void {
    this.lookups.getGovernorates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: g => this.governorates.set(g ?? []), error: () => undefined });
    this.lookups.getPropertyTypeCatalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: t => this.propertyTypes.set(t ?? []), error: () => undefined });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getMine().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => { this.requests.set(list ?? []); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  name(item: { nameAr: string; nameEn: string }): string {
    return pickLocalizedName(item, currentUiLanguage() ?? 'ar');
  }

  get canProposePlaces(): boolean {
    return this.placeProposals.canPropose();
  }

  onDistrictTyped(text: string | null): void {
    this.districtText = text ?? '';
  }

  onGovernorate(id: number): void {
    this.form.districtId = null;
    this.districtText = '';
    this.districts.set([]);
    if (!id) return;
    this.lookups.getDistricts(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: d => this.districts.set(d ?? []), error: () => undefined });
  }

  startCreate(): void {
    this.districtText = '';
    this.form = emptyForm();
    this.expiresDate = '';
    this.editingId.set(null);
    this.editing.set(true);
  }

  startEdit(r: SearchRequest): void {
    this.districtText = '';
    this.form = { ...r };
    this.expiresDate = r.expiresAt?.slice(0, 10) ?? '';
    this.editingId.set(r.id);
    this.editing.set(true);
    if (r.governorateId) {
      this.lookups.getDistricts(r.governorateId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: d => this.districts.set(d ?? []), error: () => undefined });
    }
  }

  cancel(): void {
    this.editing.set(false);
  }

  save(): void {
    const body: SearchRequestInput = {
      ...this.form,
      details: this.form.details?.trim() || null,
      expiresAt: this.expiresDate ? `${this.expiresDate}T23:59:00Z` : null
    };
    const id = this.editingId();
    this.saving.set(true);
    (id ? this.api.update(id, body) : this.api.create(body)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        const typedDistrict = this.districtText.trim();
        if (typedDistrict && body.governorateId) {
          this.placeProposals.propose({ governorateId: body.governorateId, type: 'District', name: typedDistrict }).subscribe();
        }
        this.districtText = '';
        this.saving.set(false);
        this.editing.set(false);
        this.toast.success(this.translate.instant(id ? 'SEARCH_REQUESTS.SAVED' : 'SEARCH_REQUESTS.CREATED'));
        this.load();
      },
      error: () => this.saving.set(false)
    });
  }

  act(r: SearchRequest, action: 'pause' | 'resume' | 'close' | 'renew'): void {
    if (action === 'close' && !confirm(this.translate.instant('SEARCH_REQUESTS.CONFIRM_CLOSE'))) return;
    this.api.change(r.id, action).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => this.load(), error: () => undefined });
  }

  toggleMatches(r: SearchRequest): void {
    if (this.openId() === r.id) { this.openId.set(null); return; }
    this.openId.set(r.id);
    this.matches.set([]);
    this.api.getMatches(r.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: m => this.matches.set(m ?? []), error: () => undefined });
  }

  price(m: SearchRequestMatch): string {
    return formatListingPrice(m.listingType === 'ForSale' ? m.purchasePrice : (m.warmRent ?? m.coldRent), m.currencyCode);
  }

  date(iso: string): string {
    const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
}
