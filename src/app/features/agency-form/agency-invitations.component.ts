// src/app/features/agency-form/agency-invitations.component.ts
//
// صندوق دعوات المكاتب للمستخدم غير المنتمي لأي مكتب (/F-AGY-02/): قبول أو رفض،
// وعرض معرّف المستخدم مع زر نسخ — لأن الدعوة في الباك اند تأخذ معرّف المستخدم
// فقط (لا بحث بالبريد/الهاتف)، فهذه هي الطريقة التي يعطي بها الموظف معرّفه لمالك
// المكتب.
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { AgencyInvitation } from '../../core/models/agency.model';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-agency-invitations',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslateModule],
  styleUrl: './agency-panels.scss',
  template: `
    <section class="panel">
      <header class="panel__header">
        <h2 class="panel__title">{{ 'AGENCY_INVITES.TITLE' | translate }}</h2>
        <p class="panel__desc">{{ 'AGENCY_INVITES.DESC' | translate }}</p>
      </header>
      <div class="panel__body">
        <p class="field-hint" *ngIf="loading()">{{ 'COMMON.LOADING' | translate }}</p>

        <p class="field-hint" *ngIf="!loading() && !invitations().length">
          {{ 'AGENCY_INVITES.EMPTY' | translate }}
        </p>

        <ul class="row-list" *ngIf="invitations().length">
          <li class="row" *ngFor="let inv of invitations(); trackBy: trackInvitation">
            <div class="row__main">
              <a class="row__name" [routerLink]="['/agencies', inv.agencySlug]">{{ inv.agencyName }}</a>
              <span class="row__meta">
                {{ 'AGENCY_INVITES.FROM' | translate: { name: inv.inviterName } }}
                · {{ 'AGENCY_INVITES.EXPIRES' | translate }} {{ inv.expiresAt | date:'dd/MM/yyyy' }}
              </span>
            </div>
            <div class="row__actions">
              <button type="button" class="btn btn--primary btn--sm" [disabled]="busyId()" (click)="accept(inv)">
                {{ (busyId() === inv.id + ':accept' ? 'COMMON.SAVING' : 'AGENCY_INVITES.ACCEPT') | translate }}
              </button>
              <button type="button" class="btn btn--outline btn--sm" [disabled]="busyId()" (click)="decline(inv)">
                {{ 'AGENCY_INVITES.DECLINE' | translate }}
              </button>
            </div>
          </li>
        </ul>

        <div *ngIf="userId">
          <p class="field-hint">{{ 'AGENCY_INVITES.MY_ID_HINT' | translate }}</p>
          <div class="copy-box">
            <code>{{ userId }}</code>
            <button type="button" class="btn btn--outline btn--sm" (click)="copyId()">
              {{ 'AGENCY_MANAGE.COPY' | translate }}
            </button>
          </div>
        </div>
      </div>
    </section>
  `
})
export class AgencyInvitationsComponent implements OnInit {
  private readonly agenciesApi = inject(AgenciesApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() userId: string | null = null;

  /** قُبلت دعوة — المستخدم صار عضوًا؛ الصفحة تعيد التحميل وتجدّد الجلسة. */
  @Output() readonly accepted = new EventEmitter<void>();

  readonly loading = signal(true);
  readonly invitations = signal<AgencyInvitation[]>([]);
  readonly busyId = signal<string | null>(null);

  ngOnInit(): void {
    this.agenciesApi
      .getMyInvitations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => {
          this.invitations.set((items ?? []).filter(i => i.status === 'Pending'));
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
  }

  trackInvitation(_: number, inv: AgencyInvitation): string {
    return inv.id;
  }

  accept(inv: AgencyInvitation): void {
    this.busyId.set(`${inv.id}:accept`);
    this.agenciesApi
      .acceptInvitation(inv.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.toast.success(this.translate.instant('AGENCY_INVITES.ACCEPTED', { name: inv.agencyName }));
          this.accepted.emit();
        },
        error: () => this.busyId.set(null)
      });
  }

  decline(inv: AgencyInvitation): void {
    this.busyId.set(`${inv.id}:decline`);
    this.agenciesApi
      .declineInvitation(inv.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.invitations.update(list => list.filter(i => i.id !== inv.id));
          this.toast.success(this.translate.instant('AGENCY_INVITES.DECLINED'));
        },
        error: () => this.busyId.set(null)
      });
  }

  async copyId(): Promise<void> {
    if (!this.userId) return;
    try {
      await navigator.clipboard.writeText(this.userId);
      this.toast.success(this.translate.instant('AGENCY_MANAGE.COPIED'));
    } catch {
      this.toast.error(this.translate.instant('AGENCY_MANAGE.COPY_FAILED'));
    }
  }
}
