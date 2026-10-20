import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { OtpChannel, OtpChannelOption } from '../../../core/models/auth.model';

/** رموز الدول التي لها اسم مترجم في AUTH.CHANNELS.COUNTRIES؛ أي رمز آخر يُعرض كما هو. */
const KNOWN_COUNTRY_CODES = new Set(['+963', '+53', '+98', '+850']);

/**
 * اختيار وسيلة استلام رمز التحقق (SMS / Telegram / WhatsApp).
 *
 * - مجموعة راديو حقيقية (fieldset + input[type=radio]) فتعمل بلوحة المفاتيح وقارئ الشاشة دون كود إضافي.
 * - الوسيلة غير المتاحة تبقى ظاهرة لكنها معطَّلة، وتحتها نص واضح: "هذه الخدمة غير متوفرة في بلدك"،
 *   ودائماً نص ثابت بأسماء الدول التي لا تعمل فيها (من إعدادات الباك، لا من التطبيق).
 * - لا يعرف هذا المكوّن شيئاً عن الدول أو المزوّدين؛ يعرض ما يصله فقط.
 */
@Component({
  selector: 'app-otp-channel-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgFor, NgIf, TranslateModule],
  templateUrl: './otp-channel-picker.component.html',
  styleUrls: ['./otp-channel-picker.component.scss']
})
export class OtpChannelPickerComponent {
  @Input() options: OtpChannelOption[] = [];
  @Input() selected: OtpChannel = 'Sms';
  @Input() disabled = false;
  @Output() selectedChange = new EventEmitter<OtpChannel>();

  pick(option: OtpChannelOption): void {
    if (option.available && !this.disabled) {
      this.selectedChange.emit(option.channel);
    }
  }

  isKnownCountry(code: string): boolean {
    return KNOWN_COUNTRY_CODES.has(code);
  }

  countryKey(code: string): string {
    return `AUTH.CHANNELS.COUNTRIES.${code.replace('+', '')}`;
  }

  trackByChannel(_: number, option: OtpChannelOption): OtpChannel {
    return option.channel;
  }
}
