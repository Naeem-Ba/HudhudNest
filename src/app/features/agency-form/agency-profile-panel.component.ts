// src/app/features/agency-form/agency-profile-panel.component.ts
//
// ملف المكتب في «مكتبي العقاري» (P4، للمالك فقط؛ الخادم يتحقق من الملكية في كل نداء):
// صورة الغلاف، الموقع الإلكتروني وروابط التواصل الاجتماعي (منها واتساب)، وساعات العمل الأسبوعية.
// كل قسم يُحفظ وحده. الخادم هو الحكم على الروابط: يقبل https على نطاق الشبكة فقط ورقم واتساب دوليًا.
import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { apiErrorText } from '../../core/api/api-error-text';
import {
  AGENCY_SOCIAL_NETWORKS,
  Agency,
  AgencySocialNetwork,
  AgencyWorkingDay
} from '../../core/models/agency.model';
import { ToastService } from '../../shared/services/toast.service';
import { ProfileFieldErrors, defaultWeek, linkFieldErrors, normalizeWeek, weekError } from '../../shared/utils/agency-profile';

/** نفس قيود الخادم (SetAgencyLogoCommandHandler مع Slot = Cover). */
export const COVER_MAX_BYTES = 5_000_000;
const COVER_TYPES = ['image/png', 'image/jpeg'];

const PLACEHOLDERS: Record<AgencySocialNetwork, string> = {
  WhatsApp: '+963 9XX XXX XXX',
  Facebook: 'https://facebook.com/…',
  Instagram: '@…',
  Telegram: '@…',
  X: '@…',
  LinkedIn: 'https://linkedin.com/company/…',
  YouTube: 'https://youtube.com/@…',
  TikTok: '@…'
};

@Component({
  selector: 'app-agency-profile-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  styleUrl: './agency-panels.scss',
  styles: [`
    .cover-preview { width: 100%; aspect-ratio: 3 / 1; border-radius: var(--r-md); border: 1px solid var(--border); object-fit: cover; background: var(--gray-50); display: block; }
    .cover-empty { width: 100%; aspect-ratio: 3 / 1; border-radius: var(--r-md); border: 1.5px dashed var(--border); display: grid; place-items: center; color: var(--text-muted); font-size: .85rem; }
    .row-actions { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
    .links-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: .8rem; }
    .section + .section { border-top: 1px solid var(--border); padding-top: 1rem; }
    .section { display: flex; flex-direction: column; gap: .75rem; }
    .hours { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
    .hours__day { display: grid; grid-template-columns: 7.5rem 1fr; gap: .5rem; align-items: start; padding: .4rem 0; border-bottom: 1px dashed var(--border); }
    .hours__name { font-weight: 600; font-size: .88rem; padding-top: .55rem; }
    .hours__body { display: flex; flex-direction: column; gap: .4rem; }
    .hours__range { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; }
    .hours__range input[type=time] { min-height: 40px; padding: .35rem .5rem; border: 1.5px solid var(--border); border-radius: var(--r-sm); background: var(--surface); color: var(--gray-800); font-size: 16px; }
    .check { display: inline-flex; align-items: center; gap: .4rem; font-size: .85rem; }
    @media (max-width: 480px) { .hours__day { grid-template-columns: 1fr; } .hours__name { padding-top: 0; } }
  `],
  template: `
    <section class="panel" data-testid="profile-panel">
      <div class="panel__header">
        <h2 class="panel__title">{{ 'OFFICE_PROFILE.TITLE' | translate }}</h2>
        <p class="panel__desc">{{ 'OFFICE_PROFILE.DESC' | translate }}</p>
      </div>
      <div class="panel__body">

        <!-- الغلاف -->
        <div class="section" data-testid="cover-section">
          <p class="panel__subtitle">{{ 'OFFICE_PROFILE.COVER' | translate }}</p>
          <img *ngIf="agency.coverImageUrl; else noCover" class="cover-preview" [src]="agency.coverImageUrl" alt="" data-testid="cover-preview" />
          <ng-template #noCover><div class="cover-empty">{{ 'OFFICE_PROFILE.NO_COVER' | translate }}</div></ng-template>
          <p class="field-hint">{{ 'OFFICE_PROFILE.COVER_HINT' | translate }}</p>
          <input #coverInput class="file-input" type="file" accept="image/png,image/jpeg" (change)="onCoverSelected(coverInput)" />
          <div class="row-actions">
            <button type="button" class="btn btn--outline btn--sm" [disabled]="busy() !== null" (click)="coverInput.click()" data-testid="cover-upload">
              {{ (busy() === 'cover' ? 'COMMON.SAVING' : (agency.coverImageUrl ? 'OFFICE_PROFILE.CHANGE_COVER' : 'OFFICE_PROFILE.UPLOAD_COVER')) | translate }}
            </button>
            <button type="button" class="btn btn--ghost btn--sm" *ngIf="agency.coverImageUrl" [disabled]="busy() !== null" (click)="removeCover()" data-testid="cover-remove">
              {{ 'OFFICE_PROFILE.REMOVE_COVER' | translate }}
            </button>
          </div>
          <p class="field-error" *ngIf="coverError()">{{ coverError()! | translate }}</p>
        </div>

        <!-- الموقع وروابط التواصل -->
        <form class="section" (ngSubmit)="saveLinks()" data-testid="links-form">
          <p class="panel__subtitle">{{ 'OFFICE_PROFILE.LINKS' | translate }}</p>
          <p class="field-hint">{{ 'OFFICE_PROFILE.LINKS_HINT' | translate }}</p>
          <div class="field">
            <label for="office-website">{{ 'OFFICE_PROFILE.WEBSITE' | translate }}</label>
            <input id="office-website" type="url" name="website" dir="ltr" inputmode="url" maxlength="300"
                   placeholder="https://…" [(ngModel)]="website" data-testid="link-website" />
            <p class="field-error" *ngIf="errors().website">{{ errors().website! | translate }}</p>
          </div>
          <div class="links-grid">
            <div class="field" *ngFor="let n of networks">
              <label [for]="'office-link-' + n">{{ 'OFFICE_PROFILE.NETWORK.' + n.toUpperCase() | translate }}</label>
              <input [id]="'office-link-' + n" [type]="n === 'WhatsApp' ? 'tel' : 'text'" [name]="'link-' + n" dir="ltr" maxlength="300"
                     [attr.inputmode]="n === 'WhatsApp' ? 'tel' : 'url'" [placeholder]="placeholder(n)"
                     [(ngModel)]="links[n]" [attr.data-testid]="'link-' + n" />
              <p class="field-error" *ngIf="errors().links[n]">{{ errors().links[n]! | translate }}</p>
            </div>
          </div>
          <div class="row-actions">
            <button type="submit" class="btn btn--primary btn--sm" [disabled]="busy() !== null" data-testid="links-save">
              {{ (busy() === 'links' ? 'COMMON.SAVING' : 'OFFICE_PROFILE.SAVE_LINKS') | translate }}
            </button>
          </div>
        </form>

        <!-- ساعات العمل -->
        <div class="section" data-testid="hours-section">
          <p class="panel__subtitle">{{ 'OFFICE_PROFILE.HOURS' | translate }}</p>
          <p class="field-hint">{{ 'OFFICE_PROFILE.HOURS_HINT' | translate }}</p>

          <button type="button" class="btn btn--outline btn--sm" *ngIf="!week()" (click)="startHours()" data-testid="hours-start">
            + {{ 'OFFICE_PROFILE.ADD_HOURS' | translate }}
          </button>

          <ng-container *ngIf="week() as days">
            <ul class="hours">
              <li class="hours__day" *ngFor="let d of days; let i = index" [attr.data-testid]="'hours-' + d.day">
                <span class="hours__name">{{ 'OFFICE_PROFILE.DAY.' + d.day.toUpperCase() | translate }}</span>
                <div class="hours__body">
                  <label class="check">
                    <input type="checkbox" [checked]="d.ranges.length === 0" (change)="toggleClosed(i)" />
                    {{ 'OFFICE_PROFILE.CLOSED' | translate }}
                  </label>
                  <div class="hours__range" *ngFor="let r of d.ranges; let j = index">
                    <input type="time" [name]="'opens-' + i + '-' + j" [(ngModel)]="r.opens" [attr.aria-label]="'OFFICE_PROFILE.OPENS' | translate" />
                    <span aria-hidden="true">–</span>
                    <input type="time" [name]="'closes-' + i + '-' + j" [ngModel]="r.closes === '24:00' ? '23:59' : r.closes"
                           (ngModelChange)="r.closes = $event === '23:59' ? '24:00' : $event" [attr.aria-label]="'OFFICE_PROFILE.CLOSES' | translate" />
                    <button type="button" class="btn btn--ghost btn--sm" *ngIf="j === 1" (click)="removeRange(i, j)">
                      {{ 'OFFICE_PROFILE.REMOVE_PERIOD' | translate }}
                    </button>
                  </div>
                  <button type="button" class="btn btn--ghost btn--sm" *ngIf="d.ranges.length === 1" (click)="addRange(i)">
                    + {{ 'OFFICE_PROFILE.ADD_PERIOD' | translate }}
                  </button>
                </div>
              </li>
            </ul>
            <p class="field-error" *ngIf="hoursError()">{{ hoursError()! | translate }}</p>
            <div class="row-actions">
              <button type="button" class="btn btn--primary btn--sm" [disabled]="busy() !== null" (click)="saveHours()" data-testid="hours-save">
                {{ (busy() === 'hours' ? 'COMMON.SAVING' : 'OFFICE_PROFILE.SAVE_HOURS') | translate }}
              </button>
              <button type="button" class="btn btn--ghost btn--sm" [disabled]="busy() !== null" (click)="clearHours()" data-testid="hours-clear">
                {{ 'OFFICE_PROFILE.CLEAR_HOURS' | translate }}
              </button>
            </div>
          </ng-container>
        </div>
      </div>
    </section>
  `
})
export class AgencyProfilePanelComponent implements OnChanges {
  private readonly api = inject(AgenciesApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) agency!: Agency;
  /** يُطلق بالمكتب كما أعاده الخادم بعد كل حفظ ناجح. */
  @Output() readonly agencyChanged = new EventEmitter<Agency>();

  readonly networks = AGENCY_SOCIAL_NETWORKS;
  readonly busy = signal<null | 'cover' | 'links' | 'hours'>(null);
  readonly coverError = signal<string | null>(null);
  readonly errors = signal<ProfileFieldErrors>({ website: null, links: {} });
  readonly week = signal<AgencyWorkingDay[] | null>(null);
  readonly hoursError = signal<string | null>(null);

  website = '';
  links: Record<AgencySocialNetwork, string> = emptyLinks();

  ngOnChanges(): void {
    this.website = this.agency.website ?? '';
    this.links = emptyLinks();
    for (const l of this.agency.socialLinks ?? []) this.links[l.network] = l.value;
    this.week.set(normalizeWeek(this.agency.workingHours));
  }

  placeholder(network: AgencySocialNetwork): string {
    return PLACEHOLDERS[network];
  }

  onCoverSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!COVER_TYPES.includes(file.type)) {
      this.coverError.set('OFFICE_PROFILE.COVER_TYPE');
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      this.coverError.set('OFFICE_PROFILE.COVER_TOO_LARGE');
      return;
    }
    this.coverError.set(null);
    this.busy.set('cover');
    this.api.uploadCover(this.agency.id, file).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: agency => this.done(agency, 'OFFICE_PROFILE.COVER_SAVED'),
      error: err => this.failed(err)
    });
  }

  removeCover(): void {
    this.busy.set('cover');
    this.api.removeCover(this.agency.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: agency => this.done(agency, 'OFFICE_PROFILE.COVER_REMOVED'),
      error: err => this.failed(err)
    });
  }

  saveLinks(): void {
    const sent = this.networks
      .map(network => ({ network, value: this.links[network]?.trim() || null }))
      .filter(l => l.value !== null);
    this.errors.set({ website: null, links: {} });
    this.busy.set('links');
    this.api.setContactLinks(this.agency.id, { website: this.website.trim() || null, links: sent })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: agency => this.done(agency, 'OFFICE_PROFILE.LINKS_SAVED'),
        error: err => {
          const fields = linkFieldErrors(err, sent);
          if (fields) {
            this.busy.set(null);
            this.errors.set(fields);
            this.toast.error(this.translate.instant('OFFICE_PROFILE.FIX_FIELDS'));
            return;
          }
          this.failed(err);
        }
      });
  }

  startHours(): void {
    this.week.set(defaultWeek());
  }

  toggleClosed(index: number): void {
    this.updateDay(index, d => ({ ...d, ranges: d.ranges.length ? [] : [{ opens: '09:00', closes: '17:00' }] }));
  }

  addRange(index: number): void {
    this.updateDay(index, d => ({ ...d, ranges: [...d.ranges, { opens: '17:00', closes: '20:00' }] }));
  }

  removeRange(index: number, range: number): void {
    this.updateDay(index, d => ({ ...d, ranges: d.ranges.filter((_, j) => j !== range) }));
  }

  saveHours(): void {
    const days = this.week();
    if (!days) return;
    const error = weekError(days);
    this.hoursError.set(error);
    if (error) return;
    this.busy.set('hours');
    this.api.setWorkingHours(this.agency.id, days).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: agency => this.done(agency, 'OFFICE_PROFILE.HOURS_SAVED'),
      error: err => this.failed(err)
    });
  }

  clearHours(): void {
    this.hoursError.set(null);
    if (!this.agency.workingHours?.length) {
      this.week.set(null);
      return;
    }
    this.busy.set('hours');
    this.api.setWorkingHours(this.agency.id, null).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: agency => this.done(agency, 'OFFICE_PROFILE.HOURS_CLEARED'),
      error: err => this.failed(err)
    });
  }

  private updateDay(index: number, change: (day: AgencyWorkingDay) => AgencyWorkingDay): void {
    const days = this.week();
    if (!days) return;
    this.week.set(days.map((d, i) => (i === index ? change(d) : d)));
    this.hoursError.set(null);
  }

  private done(agency: Agency, messageKey: string): void {
    this.busy.set(null);
    this.toast.success(this.translate.instant(messageKey));
    this.agencyChanged.emit(agency);
  }

  private failed(error: unknown): void {
    this.busy.set(null);
    this.toast.error(apiErrorText(error) ?? this.translate.instant('OFFICE_PROFILE.SAVE_ERROR'));
  }
}

function emptyLinks(): Record<AgencySocialNetwork, string> {
  return { WhatsApp: '', Facebook: '', Instagram: '', Telegram: '', X: '', LinkedIn: '', YouTube: '', TikTok: '' };
}
