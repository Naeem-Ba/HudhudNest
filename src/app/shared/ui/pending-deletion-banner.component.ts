// App-wide notice while a self-service account-deletion request is pending.
//
// DELETE /api/Users/me only schedules the deletion (30-day window, see
// RequestDeleteUserCommandHandler); the account keeps working until then. Someone who signs in
// again during the window, possibly having changed their mind, must see that the deletion is
// still coming and be able to withdraw it in one click — otherwise the cancel endpoint is
// unreachable unless they happen to open the profile page. Reads the shared profile$ that
// AuthService already hydrates on sign-in, so it adds no request of its own. Hidden on /profile,
// whose Danger Zone shows the same state with the same button.
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { combineLatest, filter, map, startWith } from 'rxjs';

import { ProfileService } from '../../core/api/profile.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../services/toast.service';
import { formatDeletionDate } from '../utils/deletion-date';

@Component({
  selector: 'app-pending-deletion-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <div class="pending-deletion" role="status" *ngIf="scheduledFor() as date">
      <p class="pending-deletion__text">
        {{ 'PROFILE.DELETION_PENDING.MESSAGE' | translate: { date: formatDate(date) } }}
      </p>
      <div class="pending-deletion__actions">
        <button type="button" class="pending-deletion__cancel" [disabled]="cancelling()" (click)="cancel()">
          {{ cancelling()
            ? ('PROFILE.DELETION_PENDING.CANCELLING' | translate)
            : ('PROFILE.DELETION_PENDING.CANCEL_BTN' | translate) }}
        </button>
        <a class="pending-deletion__details" routerLink="/profile">
          {{ 'PROFILE.DELETION_PENDING.DETAILS_LINK' | translate }}
        </a>
      </div>
    </div>
  `,
  styles: [`
    .pending-deletion {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin: 0.75rem 20px 0;
      padding: 0.85rem 1rem;
      border: 1px solid rgba(220, 38, 38, .3);
      border-radius: 12px;
      background: var(--danger-soft, rgba(220, 38, 38, .05));
    }

    .pending-deletion__text {
      margin: 0;
      color: var(--gray-900);
      font-size: var(--text-sm, 0.9rem);
      font-weight: 600;
      line-height: 1.7;
    }

    .pending-deletion__actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .pending-deletion__cancel {
      border: none;
      border-radius: 10px;
      background: var(--primary); color: var(--on-primary);
      cursor: pointer;
      font-weight: 700;
      font-size: 0.85rem;
      padding: 0.5rem 0.9rem;
    }

    .pending-deletion__cancel:disabled {
      opacity: .6;
      cursor: default;
    }

    .pending-deletion__details {
      color: var(--primary-text);
      font-size: 0.85rem;
      font-weight: 600;
    }
  `]
})
export class PendingDeletionBannerComponent {
  private readonly profileService = inject(ProfileService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly cancelling = signal(false);

  private readonly onProfilePage$ = this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    map(event => event.urlAfterRedirects),
    startWith(this.router.url),
    map(url => url.split(/[?#]/)[0] === '/profile')
  );

  readonly scheduledFor = toSignal(
    combineLatest([this.auth.isLoggedIn$, this.profileService.profile$, this.onProfilePage$]).pipe(
      map(([loggedIn, profile, onProfilePage]) =>
        loggedIn && !onProfilePage ? profile?.DeletionScheduledFor ?? null : null
      )
    ),
    { initialValue: null }
  );

  formatDate(value: string): string {
    return formatDeletionDate(value, this.translate.currentLang);
  }

  cancel(): void {
    if (this.cancelling()) return;
    this.cancelling.set(true);

    this.profileService
      .cancelAccountDeletion()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancelling.set(false);
          this.toast.success(this.translate.instant('PROFILE.DELETION_PENDING.CANCEL_SUCCESS'));
        },
        error: () => {
          this.cancelling.set(false);
          this.toast.error(this.translate.instant('PROFILE.DELETION_PENDING.CANCEL_ERROR'));
        }
      });
  }
}
