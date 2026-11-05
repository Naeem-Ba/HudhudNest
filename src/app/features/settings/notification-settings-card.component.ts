import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import {
  NotificationPreferences,
  NotificationPreferencesApiService,
  NotificationPreferencesUpdate,
  PushPreviewLevel,
  minuteToTime,
  timeToMinute
} from '../../core/api/notification-preferences-api.service';
import { PreferencesService } from '../../core/services/preferences.service';

const DEFAULT_START = 22 * 60;
const DEFAULT_END = 7 * 60;

/**
 * Which notifications reach this person: per category in the app and as push, how much a push
 * shows on the lock screen, and quiet hours. Account-safety events are mandatory and have no switch.
 * Every change is saved at once; the server answer is the single source of truth.
 */
@Component({
  selector: 'app-notification-settings-card',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (signedIn) {
      <section class="ns" aria-labelledby="ns-title">
        <h3 id="ns-title">{{ 'NOTIFICATION_SETTINGS.TITLE' | translate }}</h3>
        <p class="ns__hint">{{ 'NOTIFICATION_SETTINGS.DESC' | translate }}</p>

        @if (prefs(); as p) {
          <table class="ns__table">
            <thead>
              <tr>
                <th scope="col">{{ 'NOTIFICATION_SETTINGS.CATEGORY' | translate }}</th>
                <th scope="col">{{ 'NOTIFICATION_SETTINGS.IN_APP' | translate }}</th>
                <th scope="col">{{ 'NOTIFICATION_SETTINGS.PUSH' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (c of p.categories; track c.id) {
                <tr>
                  <th scope="row">{{ 'NOTIFICATION_SETTINGS.CATEGORIES.' + c.id | translate }}</th>
                  <td>
                    @if (c.mutable) {
                      <input type="checkbox" [id]="'ns-app-' + c.id" [checked]="!p.mutedCategories.includes(c.id)"
                        [disabled]="saving()" (change)="toggle('mutedCategories', c.id, $any($event.target))"
                        [attr.aria-label]="'NOTIFICATION_SETTINGS.IN_APP' | translate" />
                    } @else {
                      <span class="ns__always">{{ 'NOTIFICATION_SETTINGS.ALWAYS' | translate }}</span>
                    }
                  </td>
                  <td>
                    @if (c.mutable) {
                      <input type="checkbox" [id]="'ns-push-' + c.id"
                        [checked]="!p.mutedCategories.includes(c.id) && !p.pushMutedCategories.includes(c.id)"
                        [disabled]="saving() || p.mutedCategories.includes(c.id)"
                        (change)="toggle('pushMutedCategories', c.id, $any($event.target))"
                        [attr.aria-label]="'NOTIFICATION_SETTINGS.PUSH' | translate" />
                    } @else {
                      <span class="ns__always">{{ 'NOTIFICATION_SETTINGS.ALWAYS' | translate }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <div class="ns__field">
            <label for="ns-preview">{{ 'NOTIFICATION_SETTINGS.PREVIEW_LABEL' | translate }}</label>
            <select id="ns-preview" [disabled]="saving()" (change)="setPreview($any($event.target).value)">
              <option value="Generic" [selected]="p.pushPreview === 'Generic'">{{ 'NOTIFICATION_SETTINGS.PREVIEW_GENERIC' | translate }}</option>
              <option value="Full" [selected]="p.pushPreview === 'Full'">{{ 'NOTIFICATION_SETTINGS.PREVIEW_FULL' | translate }}</option>
            </select>
            <p class="ns__hint">{{ 'NOTIFICATION_SETTINGS.PREVIEW_HINT' | translate }}</p>
          </div>

          <div class="ns__field">
            <label class="ns__check">
              <input type="checkbox" [checked]="quietOn()" [disabled]="saving()" (change)="setQuiet($any($event.target))" />
              {{ 'NOTIFICATION_SETTINGS.QUIET_LABEL' | translate }}
            </label>
            @if (quietOn()) {
              <div class="ns__times">
                <label>{{ 'NOTIFICATION_SETTINGS.QUIET_FROM' | translate }}
                  <input type="time" [value]="startTime()" [disabled]="saving()" (change)="setTimes('start', $any($event.target).value)" />
                </label>
                <label>{{ 'NOTIFICATION_SETTINGS.QUIET_TO' | translate }}
                  <input type="time" [value]="endTime()" [disabled]="saving()" (change)="setTimes('end', $any($event.target).value)" />
                </label>
              </div>
            }
            <p class="ns__hint">{{ 'NOTIFICATION_SETTINGS.QUIET_HINT' | translate }}</p>
          </div>
        } @else if (loadFailed()) {
          <p class="ns__error" role="alert">{{ 'NOTIFICATION_SETTINGS.LOAD_FAILED' | translate }}</p>
        }

        <p class="ns__status" role="status" aria-live="polite">
          @if (saving()) { {{ 'NOTIFICATION_SETTINGS.SAVING' | translate }} }
          @else if (saveFailed()) { <span class="ns__error">{{ 'NOTIFICATION_SETTINGS.SAVE_FAILED' | translate }}</span> }
        </p>
      </section>
    }
  `,
  styles: [`
    .ns { display: grid; gap: 0.75rem; padding: 1rem 0; }
    .ns h3 { margin: 0; }
    .ns__hint { margin: 0; font-size: 0.85rem; opacity: 0.75; }
    .ns__table { width: 100%; border-collapse: collapse; }
    .ns__table th, .ns__table td { padding: 0.5rem 0.4rem; text-align: start; border-bottom: 1px solid var(--border-color, #e3e3e3); }
    .ns__table thead th { font-size: 0.8rem; opacity: 0.75; }
    .ns__table input[type='checkbox'] { width: 22px; height: 22px; }
    .ns__always { font-size: 0.8rem; opacity: 0.7; }
    .ns__field { display: grid; gap: 0.35rem; }
    .ns__check { display: flex; gap: 0.5rem; align-items: center; }
    .ns__times { display: flex; gap: 1rem; flex-wrap: wrap; }
    .ns__times label { display: grid; gap: 0.25rem; }
    .ns select, .ns input[type='time'] { padding: 0.55rem 0.7rem; border-radius: 8px; border: 1px solid var(--border-color, #cfcfcf); background: var(--surface, #fff); color: inherit; font: inherit; min-height: 44px; }
    .ns__status { margin: 0; min-height: 1.2em; font-size: 0.9rem; }
    .ns__error { color: var(--danger-text); }
  `]
})
export class NotificationSettingsCardComponent implements OnInit {
  private readonly api = inject(NotificationPreferencesApiService);
  private readonly account = inject(PreferencesService);

  protected readonly signedIn = this.account.isSignedIn;
  protected readonly prefs = signal<NotificationPreferences | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveFailed = signal(false);
  protected readonly loadFailed = signal(false);

  protected readonly quietOn = computed(() => {
    const p = this.prefs();
    return p !== null && p.quietStartMinute !== null && p.quietEndMinute !== null;
  });
  protected readonly startTime = computed(() => minuteToTime(this.prefs()?.quietStartMinute ?? null));
  protected readonly endTime = computed(() => minuteToTime(this.prefs()?.quietEndMinute ?? null));

  ngOnInit(): void {
    if (!this.signedIn) {
      return;
    }
    this.api.get().subscribe({
      next: p => this.prefs.set(p),
      error: () => this.loadFailed.set(true)
    });
  }

  /** The box says what the person wants: ticked = the category leaves the muted list, unticked = it joins it. */
  protected toggle(list: 'mutedCategories' | 'pushMutedCategories', category: string, box: HTMLInputElement): void {
    const current = this.prefs();
    if (!current) {
      return;
    }
    const without = current[list].filter(id => id !== category);
    this.save({ [list]: box.checked ? without : [...without, category] }, box);
  }

  protected setPreview(level: PushPreviewLevel): void {
    this.save({ pushPreview: level === 'Full' ? 'Full' : 'Generic' });
  }

  protected setQuiet(box: HTMLInputElement): void {
    if (!box.checked) {
      this.save({ quietHoursEnabled: false }, box);
      return;
    }
    const p = this.prefs();
    this.save({
      quietHoursEnabled: true,
      quietStartMinute: p?.quietStartMinute ?? DEFAULT_START,
      quietEndMinute: p?.quietEndMinute ?? DEFAULT_END,
      timeZoneId: this.deviceZone()
    }, box);
  }

  protected setTimes(which: 'start' | 'end', value: string): void {
    const minute = timeToMinute(value);
    if (minute === null) {
      return;
    }
    this.save(which === 'start'
      ? { quietStartMinute: minute, timeZoneId: this.deviceZone() }
      : { quietEndMinute: minute, timeZoneId: this.deviceZone() });
  }

  private deviceZone(): string | undefined {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
      return undefined;
    }
  }

  /** `box` is the checkbox the person just flipped; a failed save flips it back, since the page state did not change. */
  private save(change: NotificationPreferencesUpdate, box?: HTMLInputElement): void {
    this.saving.set(true);
    this.saveFailed.set(false);
    this.api.update(change).subscribe({
      next: p => {
        this.prefs.set(p);
        this.saving.set(false);
      },
      error: () => {
        this.saving.set(false);
        this.saveFailed.set(true);
        if (box) {
          box.checked = !box.checked;
        }
        // Re-read so every control shows what is really saved.
        this.api.get().subscribe({ next: p => this.prefs.set(p), error: () => undefined });
      }
    });
  }
}
