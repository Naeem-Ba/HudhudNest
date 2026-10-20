import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { LookupsApiService, StructuredLocationLookup } from './lookups-api.service';

/**
 * The governorate list, loaded once and shared by every provider-onboarding screen (join form,
 * admin filters, approval scope). Names follow the UI language; German falls back to English
 * because the lookup table only carries Arabic and English.
 */
@Injectable({ providedIn: 'root' })
export class GovernorateDirectory {
  private readonly lookups = inject(LookupsApiService);
  private readonly translate = inject(TranslateService);

  private readonly itemsSignal = signal<StructuredLocationLookup[]>([]);
  private loading = false;

  readonly items = computed(() => this.itemsSignal());

  ensureLoaded(): void {
    if (this.itemsSignal().length > 0 || this.loading) return;
    this.loading = true;
    this.lookups.getGovernorates().subscribe({
      next: items => { this.itemsSignal.set(items); this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  label(item: StructuredLocationLookup): string {
    const arabic = (this.translate.currentLang || this.translate.defaultLang) === 'ar';
    return (arabic ? item.nameAr : item.nameEn) || item.nameAr || item.nameEn || String(item.id);
  }

  name(id: number): string {
    const item = this.itemsSignal().find(g => g.id === id);
    return item ? this.label(item) : String(id);
  }

  names(ids: readonly number[] | null | undefined): string {
    const separator = (this.translate.currentLang || this.translate.defaultLang) === 'ar' ? '، ' : ', ';
    return (ids ?? []).map(id => this.name(id)).join(separator);
  }
}
