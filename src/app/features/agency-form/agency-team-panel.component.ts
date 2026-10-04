// src/app/features/agency-form/agency-team-panel.component.ts
//
// إدارة المكتب بعد إنشائه (/UI-06/، /F-AGY-02..05/): الرابط العام، الشعار، الأعضاء
// (إزالة/مغادرة)، دعوة عضو (بالمعرّف أو البريد أو الهاتف) والدعوات المعلّقة، نقل
// الملكية، والتعطيل وإعادة التفعيل. يُعرض داخل /my-agency تحت نموذج
// التعديل لمالك المكتب، ووحده (قراءة + مغادرة) لعضو ليس مالكًا.
//
// ما يُخفى هنا عن غير المالك تجميلي فقط — كل معالج في الباك اند يقارن المتصل بـ
// OwnerUserId الفعلي (ADR-006)، فلا تعتمد أي صلاحية على هذه الواجهة.
//
// أخطاء الـ API تُعرض أصلاً كـ toast عبر ApiErrorInterceptor، لذا لا يكرّرها هذا
// المكوّن؛ يكتفي بإعادة الحالة (saving…) وبتلميح داخل الحقل حيث يفيد.
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import {
  Agency,
  AgencyInvitation,
  AgencyMember,
  AgencySentInvitation,
  InviteTarget,
  parseInviteTarget
} from '../../core/models/agency.model';
import { Observable } from 'rxjs';
import { ToastService } from '../../shared/services/toast.service';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { PropertyShareUrlService } from '../../core/sharing/property-share-url.service';

/** نفس قيود SetAgencyLogoCommandHandler تقريبًا؛ الخادم هو الحكم النهائي. */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type PendingAction =
  | { kind: 'remove'; member: AgencyMember }
  | { kind: 'leave' }
  | { kind: 'transfer'; member: AgencyMember }
  | { kind: 'deactivate' };

@Component({
  selector: 'app-agency-team-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule, ConfirmModalComponent, ImageFallbackDirective],
  styleUrl: './agency-panels.scss',
  template: `
    <div class="panels">
      <div class="notice notice--warning" *ngIf="!agency.isActive">
        <p>{{ 'AGENCY_MANAGE.INACTIVE_NOTICE' | translate }}</p>
        <button *ngIf="isOwner" type="button" class="btn btn--outline btn--sm reactivate-btn"
          [disabled]="busy()" (click)="reactivate()">
          {{ (busy() === 'reactivate' ? 'COMMON.SAVING' : 'AGENCY_MANAGE.REACTIVATE') | translate }}
        </button>
      </div>

      <!-- ── الرابط العام ───────────────────────────────── -->
      <section class="panel" *ngIf="agency.isActive">
        <header class="panel__header">
          <h2 class="panel__title">{{ 'AGENCY_MANAGE.PUBLIC_PAGE' | translate }}</h2>
          <p class="panel__desc">{{ 'AGENCY_MANAGE.PUBLIC_PAGE_DESC' | translate }}</p>
        </header>
        <div class="panel__body">
          <div class="copy-box">
            <code>{{ publicUrl() }}</code>
            <button type="button" class="btn btn--outline btn--sm" (click)="copy(publicUrl())">
              {{ 'AGENCY_MANAGE.COPY' | translate }}
            </button>
            <a class="btn btn--ghost btn--sm" [routerLink]="['/agencies', agency.slug]">
              {{ 'AGENCY_MANAGE.OPEN_PUBLIC_PAGE' | translate }}
            </a>
          </div>
        </div>
      </section>

      <!-- ── الشعار (مالك) ──────────────────────────────── -->
      <section class="panel" *ngIf="isOwner">
        <header class="panel__header">
          <h2 class="panel__title">{{ 'AGENCY_MANAGE.LOGO' | translate }}</h2>
          <p class="panel__desc">{{ 'AGENCY_MANAGE.LOGO_DESC' | translate }}</p>
        </header>
        <div class="panel__body">
          <div class="logo-row">
            <img *ngIf="agency.logoUrl; else noLogo" class="logo-preview" [src]="agency.logoUrl" alt="" />
            <ng-template #noLogo><div class="logo-placeholder" aria-hidden="true">🏢</div></ng-template>

            <input #logoInput class="file-input" type="file" accept="image/png,image/jpeg,image/webp"
              (change)="onLogoSelected(logoInput)" />
            <button type="button" class="btn btn--outline btn--sm" [disabled]="busy()" (click)="logoInput.click()">
              {{ (busy() === 'logo' ? 'COMMON.SAVING' : (agency.logoUrl ? 'AGENCY_MANAGE.CHANGE_LOGO' : 'AGENCY_MANAGE.UPLOAD_LOGO')) | translate }}
            </button>
          </div>
          <p class="field-error" *ngIf="logoError()">{{ logoError()! | translate }}</p>
        </div>
      </section>

      <!-- ── الأعضاء ────────────────────────────────────── -->
      <section class="panel">
        <header class="panel__header">
          <h2 class="panel__title">
            {{ 'AGENCY_MANAGE.MEMBERS' | translate }} ({{ agency.memberCount }})
          </h2>
          <p class="panel__desc">{{ 'AGENCY_MANAGE.MEMBERS_DESC' | translate }}</p>
        </header>
        <div class="panel__body">
          <ul class="row-list">
            <li class="row" *ngFor="let m of sortedMembers(); trackBy: trackMember">
              <img class="row__avatar" [src]="m.profileImageUrl || '/images/default-avatar.svg'"
                appImageFallback="/images/default-avatar.svg" alt="" />
              <div class="row__main">
                <a class="row__name" [routerLink]="['/users', m.userId]">
                  {{ m.displayName }}
                  <span class="badge" *ngIf="m.isOwner">{{ 'AGENCY_MANAGE.OWNER_BADGE' | translate }}</span>
                  <span class="badge" *ngIf="m.userId === currentUserId">{{ 'AGENCY_MANAGE.YOU_BADGE' | translate }}</span>
                </a>
                <span class="row__meta" *ngIf="m.joinedAt">
                  {{ 'AGENCY_MANAGE.JOINED_AT' | translate }} {{ m.joinedAt | date:'dd/MM/yyyy' }}
                </span>
              </div>
              <div class="row__actions" *ngIf="isOwner && !m.isOwner">
                <button type="button" class="btn btn--outline btn--sm" [disabled]="busy() || !agency.isActive"
                  (click)="ask({ kind: 'transfer', member: m })">
                  {{ 'AGENCY_MANAGE.MAKE_OWNER' | translate }}
                </button>
                <button type="button" class="btn btn--danger btn--sm" [disabled]="busy()"
                  (click)="ask({ kind: 'remove', member: m })">
                  {{ 'AGENCY_MANAGE.REMOVE' | translate }}
                </button>
              </div>
            </li>
          </ul>

          <button *ngIf="!isOwner" type="button" class="btn btn--danger btn--sm" [disabled]="busy()"
            (click)="ask({ kind: 'leave' })">
            {{ 'AGENCY_MANAGE.LEAVE' | translate }}
          </button>
        </div>
      </section>

      <!-- ── دعوة عضو (مالك، مكتب مفعّل) ───────────────── -->
      <section class="panel" *ngIf="isOwner && agency.isActive">
        <header class="panel__header">
          <h2 class="panel__title">{{ 'AGENCY_MANAGE.INVITE' | translate }}</h2>
          <p class="panel__desc">{{ 'AGENCY_MANAGE.INVITE_DESC' | translate }}</p>
        </header>
        <div class="panel__body">
          <form class="inline-form" (ngSubmit)="invite()">
            <div class="field">
              <label for="invite-user">{{ 'AGENCY_MANAGE.INVITE_LABEL' | translate }}</label>
              <input id="invite-user" name="inviteInput" type="text" autocomplete="off" dir="ltr"
                [ngModel]="inviteInput()" (ngModelChange)="inviteInput.set($event); inviteError.set(null)"
                [placeholder]="'AGENCY_MANAGE.INVITE_PLACEHOLDER' | translate" />
              <p class="field-error" *ngIf="inviteError()">{{ inviteError()! | translate }}</p>
              <p class="field-hint" *ngIf="!inviteError()">{{ 'AGENCY_MANAGE.INVITE_HINT' | translate }}</p>
            </div>
            <button type="submit" class="btn btn--primary" [disabled]="busy() || !inviteInput().trim()">
              {{ (busy() === 'invite' ? 'COMMON.SAVING' : 'AGENCY_MANAGE.SEND_INVITE') | translate }}
            </button>
          </form>

          <div>
            <h3 class="panel__subtitle">{{ 'AGENCY_MANAGE.SENT_INVITES' | translate }}</h3>
            <p class="field-hint" *ngIf="!sentInvitations().length">{{ 'AGENCY_MANAGE.SENT_INVITES_EMPTY' | translate }}</p>
            <ul class="row-list" *ngIf="sentInvitations().length">
              <li class="row" *ngFor="let inv of sentInvitations(); trackBy: trackSent">
                <img class="row__avatar" [src]="inv.targetProfileImageUrl || '/images/default-avatar.svg'"
                  appImageFallback="/images/default-avatar.svg" alt="" />
                <div class="row__main">
                  <a class="row__name" [routerLink]="['/users', inv.targetUserId]">{{ inv.targetName }}</a>
                  <span class="row__meta">
                    {{ 'AGENCY_INVITES.EXPIRES' | translate }} {{ inv.expiresAt | date:'dd/MM/yyyy' }}
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- ── تعطيل المكتب (مالك) ────────────────────────── -->
      <section class="panel danger-zone" *ngIf="isOwner && agency.isActive">
        <header class="panel__header">
          <h2 class="panel__title">{{ 'AGENCY_MANAGE.DEACTIVATE' | translate }}</h2>
          <p class="panel__desc">{{ 'AGENCY_MANAGE.DEACTIVATE_DESC' | translate }}</p>
        </header>
        <div class="panel__body">
          <div>
            <button type="button" class="btn btn--danger btn--sm" [disabled]="busy()" (click)="ask({ kind: 'deactivate' })">
              {{ 'AGENCY_MANAGE.DEACTIVATE' | translate }}
            </button>
          </div>
        </div>
      </section>
    </div>

    <app-confirm-modal
      [open]="!!pending()"
      [title]="confirmTitle() | translate"
      [confirmLabel]="confirmLabel() | translate"
      [danger]="pending()?.kind !== 'transfer'"
      [loading]="!!busy()"
      (confirmed)="runPending()"
      (cancelled)="pending.set(null)"
    >
      <p>{{ confirmBody() | translate: { name: pendingMemberName() } }}</p>
    </app-confirm-modal>
  `
})
export class AgencyTeamPanelComponent implements OnChanges {
  private readonly agenciesApi = inject(AgenciesApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly shareUrl = inject(PropertyShareUrlService);

  @Input({ required: true }) agency!: Agency;
  @Input({ required: true }) currentUserId: string | null = null;

  /** المكتب بعد أي تعديل يعيده الخادم (شعار، نقل ملكية) أو بعد إزالة عضو. */
  @Output() readonly agencyChanged = new EventEmitter<void>();
  /** الأدوار في الخادم تغيّرت (نقل ملكية/مغادرة) — الصفحة تجدّد رمز الجلسة. */
  @Output() readonly rolesChanged = new EventEmitter<void>();
  /** المستخدم لم يعد عضوًا (غادر). */
  @Output() readonly left = new EventEmitter<void>();

  readonly busy = signal<null | 'logo' | 'invite' | 'reactivate' | PendingAction['kind']>(null);
  readonly sentInvitations = signal<AgencySentInvitation[]>([]);
  readonly pending = signal<PendingAction | null>(null);
  readonly inviteInput = signal('');
  readonly inviteError = signal<string | null>(null);
  readonly logoError = signal<string | null>(null);

  get isOwner(): boolean {
    return !!this.currentUserId && this.agency.ownerUserId === this.currentUserId;
  }

  readonly sortedMembers = (): AgencyMember[] =>
    [...(this.agency.members ?? [])].sort((a, b) => Number(b.isOwner) - Number(a.isOwner));

  // أصل الموقع العام لا window.location.origin — داخل تطبيق Capacitor الأخير هو
  // capacitor://localhost، وهو رابط لا يفيد أحدًا خارج الجهاز.
  readonly publicUrl = (): string => `${this.shareUrl.getSiteOrigin()}/agencies/${this.agency.slug}`;

  readonly pendingMemberName = computed(() => {
    const p = this.pending();
    return p && 'member' in p ? p.member.displayName : this.agency?.name ?? '';
  });

  readonly confirmTitle = computed(() => `AGENCY_MANAGE.CONFIRM.${this.pendingKey()}_TITLE`);
  readonly confirmBody = computed(() => `AGENCY_MANAGE.CONFIRM.${this.pendingKey()}_BODY`);
  readonly confirmLabel = computed(() => `AGENCY_MANAGE.CONFIRM.${this.pendingKey()}_ACTION`);

  private pendingKey(): string {
    return (this.pending()?.kind ?? 'remove').toUpperCase();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['agency'] || changes['currentUserId']) {
      this.loadSentInvitations();
    }
  }

  /** الدعوات المعلّقة تُعرض للمالك فقط ولمكتب مفعّل (المعطّل لا يقبل دعوات جديدة). */
  private loadSentInvitations(): void {
    if (!this.agency || !this.isOwner || !this.agency.isActive) {
      this.sentInvitations.set([]);
      return;
    }

    this.agenciesApi
      .getSentInvitations(this.agency.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => this.sentInvitations.set(items ?? []),
        error: () => this.sentInvitations.set([])
      });
  }

  trackSent(_: number, inv: AgencySentInvitation): string {
    return inv.id;
  }

  trackMember(_: number, m: AgencyMember): string {
    return m.userId;
  }

  ask(action: PendingAction): void {
    this.pending.set(action);
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success(this.translate.instant('AGENCY_MANAGE.COPIED'));
    } catch {
      this.toast.error(this.translate.instant('AGENCY_MANAGE.COPY_FAILED'));
    }
  }

  onLogoSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!LOGO_TYPES.includes(file.type)) {
      this.logoError.set('VALIDATION.IMAGE_TYPE');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      this.logoError.set('AGENCY_MANAGE.LOGO_TOO_LARGE');
      return;
    }

    this.logoError.set(null);
    this.busy.set('logo');
    this.agenciesApi
      .uploadLogo(this.agency.id, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(null);
          this.toast.success(this.translate.instant('AGENCY_MANAGE.LOGO_UPDATED'));
          this.agencyChanged.emit();
        },
        error: () => this.busy.set(null)
      });
  }

  invite(): void {
    const target = parseInviteTarget(this.inviteInput());
    if (!target) {
      this.inviteError.set('AGENCY_MANAGE.INVITE_INVALID');
      return;
    }

    this.busy.set('invite');
    this.sendInvitation(target)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(null);
          this.inviteInput.set('');
          this.toast.success(this.translate.instant('AGENCY_MANAGE.INVITE_SENT'));
          this.loadSentInvitations();
        },
        error: (err: HttpErrorResponse) => {
          this.busy.set(null);
          // 404 = لا حساب بهذا المعرّف/البريد/الرقم؛ نوضحه داخل الحقل أيضًا.
          if (err?.status === 404) {
            this.inviteError.set(target.kind === 'id'
              ? 'AGENCY_MANAGE.INVITE_USER_NOT_FOUND'
              : 'AGENCY_MANAGE.INVITE_CONTACT_NOT_FOUND');
          }
        }
      });
  }

  private sendInvitation(target: InviteTarget): Observable<AgencyInvitation> {
    switch (target.kind) {
      case 'id':
        return this.agenciesApi.createInvitation(this.agency.id, target.userId);
      case 'email':
        return this.agenciesApi.createInvitationByContact(this.agency.id, { email: target.email });
      case 'phone':
        return this.agenciesApi.createInvitationByContact(this.agency.id, { phoneNumber: target.phoneNumber });
    }
  }

  reactivate(): void {
    if (this.busy()) return;
    this.busy.set('reactivate');
    this.agenciesApi
      .reactivate(this.agency.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(null);
          this.toast.success(this.translate.instant('AGENCY_MANAGE.REACTIVATED'));
          this.agencyChanged.emit();
        },
        error: () => this.busy.set(null)
      });
  }

  runPending(): void {
    const action = this.pending();
    if (!action || this.busy()) return;
    if (action.kind === 'leave' && !this.currentUserId) return;

    this.busy.set(action.kind);
    const done = (successKey: string, after: () => void) => ({
      next: () => {
        this.busy.set(null);
        this.pending.set(null);
        this.toast.success(this.translate.instant(successKey));
        after();
      },
      error: () => {
        this.busy.set(null);
        this.pending.set(null);
      }
    });

    switch (action.kind) {
      case 'remove':
        this.agenciesApi.removeMember(this.agency.id, action.member.userId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(done('AGENCY_MANAGE.MEMBER_REMOVED', () => this.agencyChanged.emit()));
        break;
      case 'leave':
        this.agenciesApi.removeMember(this.agency.id, this.currentUserId!)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(done('AGENCY_MANAGE.LEFT', () => {
            this.rolesChanged.emit();
            this.left.emit();
          }));
        break;
      case 'transfer':
        this.agenciesApi.transferOwnership(this.agency.id, action.member.userId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(done('AGENCY_MANAGE.TRANSFERRED', () => {
            this.rolesChanged.emit();
            this.agencyChanged.emit();
          }));
        break;
      case 'deactivate':
        this.agenciesApi.deactivate(this.agency.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(done('AGENCY_MANAGE.DEACTIVATED', () => this.agencyChanged.emit()));
        break;
    }
  }
}
