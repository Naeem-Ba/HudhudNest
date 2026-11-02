import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { LookupsApiService, StructuredLocationLookup, pickLocalizedName } from './lookups-api.service';

/** What a listing stores about where it is: the structured ids plus the text typed/derived when it was created. */
export interface ListingLocationFields {
  city?: string | null;
  region?: string | null;
  governorateId?: number | null;
  districtId?: number | null;
}

/** Makes Arabic and Latin spellings comparable: case, tashkeel, tatweel, alef/ya/ta-marbuta variants, spaces. */
export function normalizePlaceName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\s\-_.,،]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Shows governorate and district names in the visitor's language.
 *
 * A listing stores `city` (the governorate) and `region` (the district) as plain text in whatever language
 * its owner had selected, so an English visitor saw "دمشق" and an Arabic visitor "Damascus". The lookup
 * tables carry a fixed Arabic and English name (and, where entered, a German name) for every place; this service re-resolves the stored ids
 * (or, for older listings without ids, the stored text) against them. German uses the
 * German name where the table has one and falls back to English. Unknown places are shown exactly as stored.
 */
@Injectable({ providedIn: 'root' })
export class LocationNamesService {
  private readonly lookups = inject(LookupsApiService);
  private readonly translate = inject(TranslateService);

  /** Read by city()/region() so OnPush templates re-render when the visitor switches language. */
  private readonly lang = signal(this.translate.currentLang || this.translate.defaultLang || 'ar');
  private readonly governorates = signal<StructuredLocationLookup[]>([]);
  private readonly districts = signal<Record<number, StructuredLocationLookup[]>>({});
  constructor() {
    this.translate.onLangChange.subscribe(event => this.lang.set(event.lang));
  }

  private governoratesRequested = false;
  private readonly districtsRequested = new Set<number>();

  /** The governorate name to show for a listing. */
  city(fields: ListingLocationFields): string {
    this.ensureGovernorates();
    const list = this.governorates();
    const match =
      (fields.governorateId != null ? list.find(g => g.id === fields.governorateId) : undefined) ??
      this.byText(list, fields.city);
    return match ? this.label(match) : (fields.city ?? '');
  }

  /** The district name to show for a listing. */
  region(fields: ListingLocationFields): string {
    const governorateId = this.governorateIdOf(fields);
    if (governorateId == null) return fields.region ?? '';
    this.ensureDistricts(governorateId);
    const list = this.districts()[governorateId] ?? [];
    const match =
      (fields.districtId != null ? list.find(d => d.id === fields.districtId) : undefined) ??
      this.byText(list, fields.region);
    return match ? this.label(match) : (fields.region ?? '');
  }

  private governorateIdOf(fields: ListingLocationFields): number | null {
    if (fields.governorateId != null) return fields.governorateId;
    this.ensureGovernorates();
    return this.byText(this.governorates(), fields.city)?.id ?? null;
  }

  private byText(list: StructuredLocationLookup[], text: string | null | undefined): StructuredLocationLookup | undefined {
    const wanted = normalizePlaceName(text);
    if (!wanted) return undefined;
    return list.find(item =>
      normalizePlaceName(item.nameAr) === wanted ||
      normalizePlaceName(item.nameEn) === wanted ||
      normalizePlaceName(item.nameDe) === wanted);
  }

  private label(item: StructuredLocationLookup): string {
    return pickLocalizedName(item, this.lang());
  }

  private ensureGovernorates(): void {
    if (this.governoratesRequested) return;
    this.governoratesRequested = true;
    this.lookups.getGovernorates().subscribe({
      next: items => this.governorates.set(items),
      error: () => { this.governoratesRequested = false; }
    });
  }

  private ensureDistricts(governorateId: number): void {
    if (this.districtsRequested.has(governorateId)) return;
    this.districtsRequested.add(governorateId);
    this.lookups.getDistricts(governorateId).subscribe({
      next: items => this.districts.update(all => ({ ...all, [governorateId]: items })),
      error: () => this.districtsRequested.delete(governorateId)
    });
  }
}
