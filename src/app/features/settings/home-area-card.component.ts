import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { LookupsApiService, StructuredLocationLookup, pickLocalizedName } from '../../core/api/lookups-api.service';
import { ProfileService } from '../../core/api/profile.service';
import { LanguageService } from '../../core/services/language.service';
import { PreferencesService } from '../../core/services/preferences.service';

/**
 * "My area": the governorate the person lives in (signed in only). It is stored on the account and used for one
 * thing, ranking the property list so featured ads of this area come first; it is never shown to other people.
 * The change is saved first and the screen shows what the server answered.
 */
@Component({
  selector: 'app-home-area-card',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (signedIn) {
      <section class="ha" aria-labelledby="ha-title">
        <h3 id="ha-title">{{ 'HOME_AREA.TITLE' | translate }}</h3>
        <p class="ha__hint">{{ 'HOME_AREA.DESC' | translate }}</p>

        <label for="ha-select">{{ 'HOME_AREA.LABEL' | translate }}</label>
        <select id="ha-select" [disabled]="saving() || governorates().length === 0" (change)="onChange($any($event.target))">
          <option value="" [selected]="selectedId() === null">{{ 'HOME_AREA.NONE' | translate }}</option>
          @for (g of governorates(); track g.id) {
            <option [value]="g.id" [selected]="g.id === selectedId()">{{ nameOf(g) }}</option>
          }
        </select>

        <p class="ha__status" role="status" aria-live="polite">
          @if (saving()) { {{ 'HOME_AREA.SAVING' | translate }} }
          @else if (saveFailed()) { <span class="ha__error">{{ 'HOME_AREA.SAVE_FAILED' | translate }}</span> }
          @else if (saved()) { {{ 'HOME_AREA.SAVED' | translate }} }
        </p>
      </section>
    }
  `,
  styles: [`
    .ha { display: grid; gap: 0.5rem; padding: 1rem 0; }
    .ha h3 { margin: 0; }
    .ha__hint { margin: 0; font-size: 0.85rem; opacity: 0.75; }
    .ha select { padding: 0.55rem 0.7rem; border-radius: 8px; border: 1px solid var(--border-color, #cfcfcf); background: var(--surface, #fff); color: inherit; font: inherit; min-height: 44px; }
    .ha__status { margin: 0; min-height: 1.2em; font-size: 0.9rem; }
    .ha__error { color: var(--danger-text); }
  `]
})
export class HomeAreaCardComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly lookups = inject(LookupsApiService);
  private readonly language = inject(LanguageService);
  private readonly account = inject(PreferencesService);

  protected readonly signedIn = this.account.isSignedIn;
  protected readonly governorates = signal<StructuredLocationLookup[]>([]);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveFailed = signal(false);

  ngOnInit(): void {
    if (!this.signedIn) {
      return;
    }

    this.lookups.getGovernorates().subscribe({ next: items => this.governorates.set(items), error: () => this.governorates.set([]) });
    this.profileService.getMe().subscribe({ next: profile => this.selectedId.set(profile.HomeGovernorateId ?? null), error: () => undefined });
  }

  protected nameOf(item: StructuredLocationLookup): string {
    return pickLocalizedName(item, this.language.getCurrent()) || String(item.id);
  }

  protected onChange(select: HTMLSelectElement): void {
    const next = select.value === '' ? null : Number(select.value);
    if (next !== null && !Number.isInteger(next)) {
      select.value = this.selectedId() === null ? '' : String(this.selectedId());
      return;
    }

    this.saving.set(true);
    this.saved.set(false);
    this.saveFailed.set(false);
    this.profileService.setHomeGovernorate(next).subscribe({
      next: profile => {
        this.selectedId.set(profile.HomeGovernorateId ?? null);
        this.saving.set(false);
        this.saved.set(true);
      },
      error: () => {
        // The control must show what is really stored, not the choice that was refused.
        select.value = this.selectedId() === null ? '' : String(this.selectedId());
        this.saving.set(false);
        this.saveFailed.set(true);
      }
    });
  }
}
