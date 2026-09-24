import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { OtpChannel, OtpChannelOption } from '../../../core/models/auth.model';

/**
 * بعد إرسال الرمز: تقول عبر أي وسيلة أُرسل، وتعرض "لم يصلك الرمز؟" مع زرّ لكل وسيلة أخرى متاحة.
 * التبديل يدوي دائماً (يبدأ المستخدم بنفسه) — لا نُرسل عبر وسيلتين تلقائياً كي لا تتضاعف التكلفة
 * أو تتكاثر التحديات، ويبقى الحدّ في الباك مشتركاً بين الوسائل كلها.
 */
@Component({
  selector: 'app-otp-channel-fallback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgFor, NgIf, TranslateModule],
  template: `
    <div class="otp-fallback">
      <p class="otp-fallback__sent" role="status">
        {{ 'AUTH.CHANNELS.SENT_VIA' | translate: { channel: ('AUTH.CHANNELS.NAMES.' + sent | translate) } }}
      </p>
      <ng-container *ngIf="alternatives.length">
        <p class="otp-fallback__title" [id]="titleId">{{ 'AUTH.CHANNELS.NO_CODE' | translate }}</p>
        <div class="otp-fallback__actions" role="group" [attr.aria-labelledby]="titleId">
          <button
            type="button"
            class="otp-fallback__button"
            *ngFor="let option of alternatives; trackBy: trackByChannel"
            [disabled]="disabled"
            (click)="pick.emit(option.channel)"
          >
            {{ 'AUTH.CHANNELS.SEND_VIA' | translate: { channel: ('AUTH.CHANNELS.NAMES.' + option.channel | translate) } }}
          </button>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .otp-fallback { display: flex; flex-direction: column; gap: .5rem; text-align: center; }
    .otp-fallback__sent, .otp-fallback__title { margin: 0; font-size: .85rem; color: var(--gray-500); line-height: 1.7; }
    .otp-fallback__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
    .otp-fallback__button {
      padding: .55rem 1rem;
      border: 1.5px solid var(--gold-text, #8a6d1d);
      border-radius: 10px;
      background: transparent;
      color: var(--gold-text, #8a6d1d);
      font-weight: 700;
      cursor: pointer;
    }
    .otp-fallback__button:disabled { opacity: .5; cursor: not-allowed; }
  `]
})
export class OtpChannelFallbackComponent {
  @Input() sent: OtpChannel = 'Sms';
  @Input() alternatives: OtpChannelOption[] = [];
  @Input() disabled = false;
  @Output() pick = new EventEmitter<OtpChannel>();

  readonly titleId = 'otp-fallback-title';

  trackByChannel(_: number, option: OtpChannelOption): OtpChannel {
    return option.channel;
  }
}
