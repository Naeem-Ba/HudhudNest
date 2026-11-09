// =============================================================
// src/app/shared/ui/geo/geo-picker.component.ts
//
// The one location input of every listing form (sale / rent, short stay):
//   Governorate (required) -> City -> District -> Neighborhood -> Street (all optional)
// - Every level below the governorate may be skipped; the places of a level are searched inside the
//   deepest area already chosen, whichever levels lie between, so nothing forces a fake relation.
// - Picking a deeper place fills the levels above it from its path; changing a level clears the ones
//   below it, so the chosen places always form one consistent chain.
// - A place that is not in the catalog is kept as typed text (the listing is never blocked) and turned
//   into a proposal for the administrators; the parent sends the proposals after the listing is saved.
// - When the map pin settles, the backend (never the browser) is asked which place it falls in. The
//   answer is only a suggestion the user accepts or ignores: nothing, especially no street, is filled in
//   without a click.
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
  signal
} from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

import { LocationsApiService } from '../../../core/api/locations-api.service';
import {
  GeoChainItem,
  GeoLocation,
  GeoLocationType,
  GeoMapSuggestion,
  GeoReverseResult,
  geoBreadcrumb,
  geoName
} from '../../../core/models/geo-location.model';
import { LangCode } from '../../../core/services/language.service';
import { GeoAutocompleteComponent } from './geo-autocomplete.component';
import { GeoPickerInitial, GeoPickerValue, GeoProposal, nodeToLocation } from './geo-picker.models';

/** The levels that sit below the governorate, in order. */
type SubLevel = 'City' | 'District' | 'Neighborhood' | 'Street';
const SUB_LEVELS: readonly SubLevel[] = ['City', 'District', 'Neighborhood', 'Street'];
const ADMIN_LEVELS: readonly SubLevel[] = ['City', 'District', 'Neighborhood'];

/** A pin has to stay put this long before the address is asked (no request per drag step). */
const PIN_SETTLE_MS = 800;

@Component({
  selector: 'app-geo-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NgFor, TranslateModule, GeoAutocompleteComponent],
  template: `
    <div class="geo-picker">
      <div class="geo-picker__grid">
        <div class="geo-picker__cell">
          <label [attr.for]="idPrefix + '-governorate'">{{ 'GEO.GOVERNORATE' | translate }} <span class="geo-picker__req">*</span></label>
          <select
            class="geo-picker__select"
            [attr.id]="idPrefix + '-governorate'"
            [disabled]="disabled"
            [value]="gov()?.id ?? ''"
            (change)="onGovernorate($any($event.target).value)"
          >
            <option value="">{{ 'PROPERTY_FORM.SELECT_PLACEHOLDER' | translate }}</option>
            <option *ngFor="let g of governorates()" [value]="g.id" [selected]="g.id === gov()?.id">{{ name(g) }}</option>
          </select>
          <p class="geo-picker__error" *ngIf="governoratesFailed() && !governorates().length" role="alert">
            {{ 'PROPERTY_FORM.STRUCTURED_LOCATION_LOAD_ERROR' | translate }}
          </p>
        </div>

        <div class="geo-picker__cell" *ngFor="let level of levels">
          <label [attr.for]="idPrefix + '-' + level.toLowerCase()">
            {{ 'GEO.LEVEL_' + level.toUpperCase() | translate }}
            <span class="geo-picker__opt">({{ 'GEO.OPTIONAL' | translate }})</span>
          </label>
          <app-geo-autocomplete
            [type]="level"
            [inputId]="idPrefix + '-' + level.toLowerCase()"
            [lang]="lang"
            [disabled]="disabled || !gov()"
            [ancestorId]="ancestorFor(level)"
            [selected]="pickOf(level)"
            [text]="textOf(level)"
            [placeholderKey]="'GEO.PLACEHOLDER_' + level.toUpperCase()"
            (picked)="onPicked(level, $event)"
            (typed)="onTyped(level, $event)"
          ></app-geo-autocomplete>
          <p class="geo-picker__hint" *ngIf="level === 'Street'">{{ 'GEO.STREET_HINT' | translate }}</p>
        </div>
      </div>

      <p class="geo-picker__warn" *ngIf="pinMismatch()" role="status">{{ 'GEO.PIN_MISMATCH' | translate: { value: pinPlace() } }}</p>

      <div class="geo-picker__suggest" *ngIf="suggestionText() as text" role="region" aria-live="polite" [attr.aria-label]="'GEO.SUGGESTED_ADDRESS' | translate">
        <p class="geo-picker__suggest-title">{{ 'GEO.SUGGESTED_ADDRESS' | translate }}</p>
        <p class="geo-picker__suggest-text">{{ text }}</p>
        <div class="geo-picker__suggest-actions">
          <button type="button" class="geo-picker__btn geo-picker__btn--primary" (click)="useSuggestion()">{{ 'GEO.USE_SUGGESTION' | translate }}</button>
          <button type="button" class="geo-picker__btn" (click)="dismissSuggestion()">{{ 'GEO.IGNORE_SUGGESTION' | translate }}</button>
        </div>
        <p class="geo-picker__attr" *ngIf="attribution()">{{ attribution() }}</p>
      </div>

      <p class="geo-picker__hint" *ngIf="proposalCount() > 0" role="status">
        {{ 'GEO.PROPOSAL_NOTE' | translate: { count: proposalCount() } }}
      </p>
    </div>
  `,
  styles: [`
    .geo-picker { display: flex; flex-direction: column; gap: .75rem; }
    .geo-picker__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: .9rem 1rem; }
    .geo-picker__cell label { display: block; margin-bottom: .35rem; font-size: .85rem; font-weight: 600; color: var(--gray-900); }
    .geo-picker__req { color: var(--error, #c0392b); }
    .geo-picker__opt { font-weight: 400; color: var(--gray-500); font-size: .76rem; }
    .geo-picker__select {
      width: 100%; box-sizing: border-box; padding: .72rem .9rem; border: 1.5px solid var(--border);
      border-radius: var(--r-md); font-size: 16px; font-family: inherit; background: var(--surface); color: var(--gray-900);
    }
    .geo-picker__select:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold-soft); }
    .geo-picker__select:disabled { opacity: .6; cursor: not-allowed; }
    .geo-picker__hint { margin: .35rem 0 0; font-size: .76rem; color: var(--gray-500); line-height: 1.5; }
    .geo-picker__error { margin: .35rem 0 0; font-size: .8rem; color: var(--error, #c0392b); }
    .geo-picker__warn {
      margin: 0; padding: .6rem .8rem; font-size: .82rem; line-height: 1.5; color: var(--gold-text);
      background: var(--gold-soft); border-radius: var(--r-md);
    }
    .geo-picker__suggest {
      padding: .8rem 1rem; border: 1px dashed var(--gold); background: var(--gold-soft); border-radius: var(--r-md);
      display: flex; flex-direction: column; gap: .5rem;
    }
    .geo-picker__suggest-title { margin: 0; font-size: .78rem; font-weight: 700; color: var(--gold-text); }
    .geo-picker__suggest-text { margin: 0; font-size: .92rem; color: var(--gray-900); line-height: 1.5; }
    .geo-picker__suggest-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
    .geo-picker__btn {
      border: 1px solid var(--border); background: var(--surface); color: var(--gray-900); font-size: .84rem;
      padding: .5rem .9rem; border-radius: var(--r-md); cursor: pointer;
    }
    .geo-picker__btn--primary { background: var(--gold); border-color: var(--gold); color: var(--navy); font-weight: 700; }
    .geo-picker__attr { margin: 0; font-size: .72rem; color: var(--gray-500); }
  `]
})
export class GeoPickerComponent implements OnInit, OnChanges {
  private static nextId = 0;

  private readonly api = inject(LocationsApiService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() lang: LangCode = 'ar';
  @Input() disabled = false;
  @Input() idPrefix = `geo-picker-${GeoPickerComponent.nextId++}`;
  /** The saved values of a listing being edited; applied once, without emitting. */
  @Input() initial: GeoPickerInitial | null = null;
  /** The pin on the map. When it settles the backend suggests an address (never applied without a click). */
  @Input() coordinates: { lat: number; lng: number } | null = null;

  @Output() valueChange = new EventEmitter<GeoPickerValue>();

  readonly levels = SUB_LEVELS;
  readonly governorates = signal<GeoLocation[]>([]);
  readonly governoratesFailed = signal(false);

  readonly gov = signal<GeoLocation | null>(null);
  private readonly picks = signal<Record<SubLevel, GeoLocation | null>>({ City: null, District: null, Neighborhood: null, Street: null });
  private readonly texts = signal<Record<SubLevel, string | null>>({ City: null, District: null, Neighborhood: null, Street: null });
  private streetProof: string | null = null;
  private streetCoordinates: { lat: number; lng: number } | null = null;

  readonly suggestion = signal<GeoReverseResult | null>(null);
  readonly suggestionDismissedFor = signal<string | null>(null);
  readonly pinMismatch = signal(false);
  readonly pinPlace = signal('');
  readonly attribution = signal<string | null>(null);
  readonly proposalCount = signal(0);

  private readonly pin$ = new Subject<{ lat: number; lng: number }>();
  private initialApplied = false;

  ngOnInit(): void {
    this.api
      .getTopLevel('SY')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => {
          this.governorates.set(items.filter(i => i.type === 'Governorate'));
          this.applyInitial();
        },
        error: () => this.governoratesFailed.set(true)
      });

    this.pin$
      .pipe(
        debounceTime(PIN_SETTLE_MS),
        distinctUntilChanged((a, b) => a.lat.toFixed(4) === b.lat.toFixed(4) && a.lng.toFixed(4) === b.lng.toFixed(4)),
        switchMap(p =>
          this.api.reverse(p.lat, p.lng, this.lang).pipe(
            // The suggestion is a convenience: if the backend or the map is down, the form simply works without it.
            catchError(() => of<GeoReverseResult | null>(null))
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(result => this.onReverse(result));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initial'] && this.initial) {
      this.applyInitial();
    }
    if (changes['coordinates'] && this.coordinates && !this.disabled) {
      this.pin$.next(this.coordinates);
    }
  }

  // ── template helpers ─────────────────────────────────────────────────────────────────────────

  name(l: GeoLocation): string {
    return geoName(l, this.lang);
  }

  pickOf(level: SubLevel): GeoLocation | null {
    return this.picks()[level];
  }

  textOf(level: SubLevel): string | null {
    return this.texts()[level];
  }

  /** The place the results of a level are searched in: the deepest chosen area above it. */
  ancestorFor(level: SubLevel): number | null {
    const above = SUB_LEVELS.slice(0, SUB_LEVELS.indexOf(level)).reverse();
    for (const l of above) {
      const p = this.picks()[l];
      if (p) return p.id;
    }
    return this.gov()?.id ?? null;
  }

  suggestionText(): string | null {
    const s = this.suggestion();
    if (!s || !s.found) return null;
    if (this.suggestionDismissedFor() === this.suggestionKey(s)) return null;

    const parts: string[] = [];
    if (s.matched) parts.push(geoBreadcrumb(s.matched.path, this.lang));
    for (const item of this.unmatchedTail(s.chain, s.matched)) parts.push(item.name);
    if (s.street && !parts.includes(s.street.name)) parts.push(s.street.name);
    const text = parts.join(' › ') || s.displayName || '';
    if (!text) return null;

    // Nothing new to offer when the form already says the same.
    return this.alreadyApplied(s) ? null : text;
  }

  // ── user input ───────────────────────────────────────────────────────────────────────────────

  onGovernorate(value: string): void {
    const id = Number(value);
    const chosen = Number.isFinite(id) && id > 0 ? this.governorates().find(g => g.id === id) ?? null : null;
    this.gov.set(chosen);
    this.clearBelow(null);
    this.emit();
  }

  onPicked(level: SubLevel, place: GeoLocation): void {
    this.setPick(level, place);
    this.fillAbovePath(place);
    this.clearBelow(level);
    this.emit();
  }

  onTyped(level: SubLevel, text: string | null): void {
    if (level === 'Street') {
      // A different text is not the street the map vouched for.
      if (this.streetProof && (text ?? '').trim() !== this.pickOrTextName('Street')) this.streetProof = null;
    }
    this.picks.update(p => ({ ...p, [level]: null }));
    this.texts.update(t => ({ ...t, [level]: text }));
    this.clearBelow(level);
    this.emit();
  }

  /** The user chose a result of the map search (`app-map-picker`). */
  applyMapSuggestion(suggestion: GeoMapSuggestion): void {
    this.applyChain(suggestion.chain, suggestion.locationId, suggestion.type === 'Street' ? suggestion : null, null);
  }

  useSuggestion(): void {
    const s = this.suggestion();
    if (!s) return;
    this.suggestionDismissedFor.set(this.suggestionKey(s));
    const deepest = s.matched?.id ?? null;
    this.applyChain(s.chain, deepest, s.street, s.matched);
  }

  dismissSuggestion(): void {
    const s = this.suggestion();
    if (s) this.suggestionDismissedFor.set(this.suggestionKey(s));
    this.suggestion.set(null);
  }

  // ── chain handling ───────────────────────────────────────────────────────────────────────────

  /**
   * Fills the picker from an address chain (levels the catalog matched, plus levels it does not know).
   * Catalog matches become picks; the first unknown level below them becomes typed text (a proposal);
   * a street the map vouched for keeps its signed proof so it can be approved by rule.
   */
  private applyChain(chain: GeoChainItem[], deepestMatchedId: number | null, street: GeoMapSuggestion | null, matched: GeoLocation | null): void {
    const finish = (place: GeoLocation | null) => {
      if (place) this.setPathPicks(place);
      this.applyUnmatchedAndStreet(chain, place, street);
      this.emit();
    };

    const matchedId = deepestMatchedId ?? [...chain].reverse().find(c => c.matchedLocationId !== null)?.matchedLocationId ?? null;
    if (matched && matched.id === matchedId) {
      finish(matched);
    } else if (matchedId !== null) {
      this.api.get(matchedId).pipe(catchError(() => of<GeoLocation | null>(null)), takeUntilDestroyed(this.destroyRef)).subscribe(finish);
    } else {
      finish(null);
    }
  }

  private setPathPicks(place: GeoLocation): void {
    const nodes = place.path;
    const gov = nodes.find(n => n.type === 'Governorate');
    if (gov) {
      this.gov.set(this.governorates().find(g => g.id === gov.id) ?? nodeToLocation(gov, nodes));
    }
    const next: Record<SubLevel, GeoLocation | null> = { City: null, District: null, Neighborhood: null, Street: null };
    const typedNext: Record<SubLevel, string | null> = { City: null, District: null, Neighborhood: null, Street: null };
    for (const level of SUB_LEVELS) {
      const node = nodes.find(n => n.type === level);
      if (node) next[level] = nodeToLocation(node, nodes);
    }
    this.picks.set(next);
    this.texts.set(typedNext);
    this.streetProof = null;
  }

  private applyUnmatchedAndStreet(chain: GeoChainItem[], place: GeoLocation | null, street: GeoMapSuggestion | null): void {
    // Levels the map knows but the catalog does not, below the deepest match: only the first is kept, since
    // the ones under it would hang off a place that does not exist yet.
    const deepestRank = place ? SUB_LEVELS.indexOf(place.type as SubLevel) : -1;
    const unknown = chain.find(c => c.matchedLocationId === null && ADMIN_LEVELS.includes(c.type as SubLevel) && SUB_LEVELS.indexOf(c.type as SubLevel) > deepestRank);
    if (unknown && this.gov()) {
      this.texts.update(t => ({ ...t, [unknown.type]: unknown.name }));
    }

    if (street && street.type === 'Street') {
      if (street.locationId && place?.type === 'Street' && street.locationId === place.id) return;
      if (street.locationId) {
        // The street is already in the catalog: pick it (its path was applied above when it was the deepest match).
        return;
      }
      this.texts.update(t => ({ ...t, Street: street.name }));
      this.streetProof = street.proof;
      this.streetCoordinates = street.latitude !== null && street.longitude !== null ? { lat: street.latitude, lng: street.longitude } : null;
    }
  }

  // ── reverse geocoding ────────────────────────────────────────────────────────────────────────

  private onReverse(result: GeoReverseResult | null): void {
    this.attribution.set(result?.attribution ?? null);
    this.suggestion.set(result && result.found ? result : null);

    const matchedGov = result?.matched?.path.find(n => n.type === 'Governorate');
    const chosen = this.gov();
    const mismatch = !!matchedGov && !!chosen && matchedGov.id !== chosen.id;
    this.pinMismatch.set(mismatch);
    this.pinPlace.set(mismatch && result?.matched ? geoBreadcrumb(result.matched.path, this.lang) : '');
  }

  private suggestionKey(s: GeoReverseResult): string {
    return `${s.matched?.id ?? ''}|${s.street?.name ?? ''}|${s.chain.map(c => c.name).join('/')}`;
  }

  private unmatchedTail(chain: GeoChainItem[], matched: GeoLocation | null): GeoChainItem[] {
    const rank = matched ? SUB_LEVELS.indexOf(matched.type as SubLevel) : -1;
    return chain.filter(c => c.matchedLocationId === null && ADMIN_LEVELS.includes(c.type as SubLevel) && SUB_LEVELS.indexOf(c.type as SubLevel) > rank).slice(0, 1);
  }

  private alreadyApplied(s: GeoReverseResult): boolean {
    const matchedSame = !s.matched || this.deepestPick()?.id === s.matched.id || this.picksContain(s.matched.id);
    const streetSame = !s.street || (this.pickOrTextName('Street').toLowerCase() === s.street.name.toLowerCase());
    const tail = this.unmatchedTail(s.chain, s.matched);
    const tailSame = tail.every(t => (this.texts()[t.type as SubLevel] ?? '').toLowerCase() === t.name.toLowerCase());
    return matchedSame && streetSame && tailSame;
  }

  private picksContain(id: number): boolean {
    return this.gov()?.id === id || SUB_LEVELS.some(l => this.picks()[l]?.id === id);
  }

  // ── state ────────────────────────────────────────────────────────────────────────────────────

  private setPick(level: SubLevel, place: GeoLocation): void {
    this.picks.update(p => ({ ...p, [level]: place }));
    this.texts.update(t => ({ ...t, [level]: null }));
    if (level === 'Street') {
      this.streetProof = null;
      this.streetCoordinates = null;
    }
  }

  /** A deeper pick (a neighborhood chosen directly) also tells which city and district it belongs to. */
  private fillAbovePath(place: GeoLocation): void {
    for (const node of place.path) {
      if (node.id === place.id) continue;
      if (node.type === 'Governorate' && !this.gov()) {
        this.gov.set(this.governorates().find(g => g.id === node.id) ?? nodeToLocation(node, place.path));
      } else if (SUB_LEVELS.includes(node.type as SubLevel) && node.type !== place.type) {
        const level = node.type as SubLevel;
        if (!this.picks()[level]) {
          this.picks.update(p => ({ ...p, [level]: nodeToLocation(node, place.path) }));
          this.texts.update(t => ({ ...t, [level]: null }));
        }
      }
    }
  }

  /** Clears every level under `level` (all sub-levels when null). Typed text of those levels goes too: it described the old area. */
  private clearBelow(level: SubLevel | null): void {
    const from = level === null ? 0 : SUB_LEVELS.indexOf(level) + 1;
    const cleared = SUB_LEVELS.slice(from);
    if (!cleared.length) return;
    this.picks.update(p => ({ ...p, ...Object.fromEntries(cleared.map(l => [l, null])) }));
    this.texts.update(t => ({ ...t, ...Object.fromEntries(cleared.map(l => [l, null])) }));
    if (cleared.includes('Street')) {
      this.streetProof = null;
      this.streetCoordinates = null;
    }
  }

  private deepestPick(): GeoLocation | null {
    for (const l of [...SUB_LEVELS].reverse()) {
      const p = this.picks()[l];
      if (p) return p;
    }
    return this.gov();
  }

  private pickOrTextName(level: SubLevel): string {
    const p = this.picks()[level];
    return (p ? this.name(p) : this.texts()[level] ?? '').trim();
  }

  private applyInitial(): void {
    if (this.initialApplied || !this.initial || !this.governorates().length) return;
    this.initialApplied = true;
    const init = this.initial;

    const typedFromInit = () => {
      // The saved city line is a typed city only when it is not just the name of a place already chosen.
      const savedCity = init.city?.trim() || '';
      const cityIsPlace = !savedCity || this.matchesAnyName(savedCity, this.gov()) || this.matchesAnyName(savedCity, this.picks().City);
      this.texts.set({
        City: this.picks().City || cityIsPlace ? null : savedCity,
        District: this.picks().District ? null : init.districtText?.trim() || null,
        Neighborhood: this.picks().Neighborhood ? null : init.neighborhoodText?.trim() || null,
        Street: this.picks().Street ? null : init.street?.trim() || null
      });
      this.proposalCount.set(this.buildProposals().length);
    };

    if (init.locationId) {
      this.api
        .get(init.locationId)
        .pipe(catchError(() => of<GeoLocation | null>(null)), takeUntilDestroyed(this.destroyRef))
        .subscribe(place => {
          if (place) {
            this.setPathPicks(place);
            // A saved street typed by hand sits next to a place that stops above the street level.
            typedFromInit();
          } else {
            this.applyLegacyInitial(init);
          }
        });
    } else {
      this.applyLegacyInitial(init);
    }
  }

  private matchesAnyName(text: string, place: GeoLocation | null): boolean {
    if (!place) return false;
    const t = text.trim().toLowerCase();
    return [place.nameAr, place.nameEn, place.nameDe ?? '', place.officialName].some(n => n.trim().toLowerCase() === t);
  }

  private applyLegacyInitial(init: GeoPickerInitial): void {
    const gov = init.governorateId ? this.governorates().find(g => g.legacy.governorateId === init.governorateId) ?? null : null;
    this.gov.set(gov);
    this.texts.set({
      City: init.city?.trim() && gov && !this.matchesAnyName(init.city, gov) ? init.city.trim() : null,
      District: init.districtText?.trim() || null,
      Neighborhood: init.neighborhoodText?.trim() || null,
      Street: init.street?.trim() || null
    });
    if (!gov || !init.districtId) return;

    // A listing that only has the old ids: find the catalog places linked to them, level by level.
    this.api
      .getDescendants(gov.id, 'District', undefined, 500)
      .pipe(catchError(() => of<GeoLocation[]>([])), takeUntilDestroyed(this.destroyRef))
      .subscribe(districts => {
        const district = districts.find(d => d.legacy.districtId === init.districtId);
        if (!district) return;
        this.setPick('District', district);
        this.fillAbovePath(district);
        if (!init.neighborhoodId) return;

        this.api
          .getDescendants(district.id, 'Neighborhood', undefined, 500)
          .pipe(catchError(() => of<GeoLocation[]>([])), takeUntilDestroyed(this.destroyRef))
          .subscribe(neighborhoods => {
            const neighborhood = neighborhoods.find(n => n.legacy.neighborhoodId === init.neighborhoodId);
            if (neighborhood) this.setPick('Neighborhood', neighborhood);
          });
      });
  }

  // ── output ───────────────────────────────────────────────────────────────────────────────────

  private emit(): void {
    const value = this.buildValue();
    this.proposalCount.set(value.proposals.length);
    this.valueChange.emit(value);
  }

  private buildValue(): GeoPickerValue {
    const deepest = this.deepestPick();
    const nodes = deepest?.path ?? [];
    const legacyOf = (type: GeoLocationType) => nodes.find(n => n.type === type);
    const texts = this.texts();
    const picks = this.picks();

    const cityName = picks.City ? this.name(picks.City) : texts.City?.trim() || '';
    const govName = this.gov() ? this.name(this.gov()!) : '';

    return {
      locationId: deepest?.id ?? null,
      governorateId: this.gov()?.legacy.governorateId ?? legacyOf('Governorate')?.legacyGovernorateId ?? null,
      governorateNameEn: this.gov()?.nameEn ?? null,
      districtId: legacyOf('District')?.legacyDistrictId ?? null,
      neighborhoodId: legacyOf('Neighborhood')?.legacyNeighborhoodId ?? null,
      // The address line always has a city: the chosen/typed one, else the governorate.
      city: cityName || govName,
      region: picks.District ? this.name(picks.District) : texts.District?.trim() || null,
      districtText: picks.District ? null : texts.District?.trim() || null,
      neighborhoodText: picks.Neighborhood ? null : texts.Neighborhood?.trim() || null,
      street: picks.Street ? this.name(picks.Street) : texts.Street?.trim() || '',
      proposals: this.buildProposals()
    };
  }

  /**
   * Typed places the catalog lacks. Administrative levels hang off the deepest catalog place above them and
   * only the first missing one is proposed (the ones under it have no parent yet). A street is proposed only
   * when everything above it exists in the catalog.
   */
  private buildProposals(): GeoProposal[] {
    const proposals: GeoProposal[] = [];
    const gov = this.gov();
    if (!gov) return proposals;

    const picks = this.picks();
    const texts = this.texts();
    let parentId = gov.id;
    let missingAbove = false;

    for (const level of ADMIN_LEVELS) {
      const pick = picks[level];
      if (pick) {
        parentId = pick.id;
        continue;
      }
      const text = texts[level]?.trim();
      if (text) {
        proposals.push({ type: level, parentLocationId: parentId, name: text, proof: null, latitude: null, longitude: null });
        missingAbove = true;
        break;
      }
    }

    const streetText = texts.Street?.trim();
    if (!picks.Street && streetText && !missingAbove) {
      const streetParent = this.deepestPick();
      if (streetParent) {
        proposals.push({
          type: 'Street',
          parentLocationId: streetParent.id,
          name: streetText,
          proof: this.streetProof,
          latitude: this.streetCoordinates?.lat ?? null,
          longitude: this.streetCoordinates?.lng ?? null
        });
      }
    }
    return proposals;
  }
}
