import { DestroyRef, computed, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs';

import { OtpChannel, OtpChannelOption } from '../models/auth.model';
import { PHONE_E164_PATTERN, normalizePhoneInput } from './phone-number';
import { PhoneAuthApiService } from './phone-auth-api.service';

/**
 * حالة اختيار وسيلة إيصال رمز التحقق لصفحة هاتف واحدة (تسجيل، استعادة، إعادة تحقق، تغيير رقم).
 *
 * - الوسائل المتاحة وأسباب عدم توفرها تأتي من الباك (POST /auth/phone/channels)؛ لا يوجد هنا أي
 *   منطق دول. يُعاد الجلب عند تغيّر الرقم (بعد توقف قصير عن الكتابة)، فيتحدّث "غير متوفر في بلدك".
 * - الوسائل المعطَّلة في النشر (CHANNEL_DISABLED) لا تُعرض أصلاً؛ فإن بقيت وسيلة واحدة (SMS كما كان
 *   دائماً) لا تظهر واجهة الاختيار إطلاقاً ويبقى السلوك القديم كما هو. وكذلك إن فشل الجلب.
 * - الاختيار الافتراضي: الوسيلة المقترحة ثم أول متاحة ثم SMS. اختيار المستخدم الصريح يبقى ما دامت
 *   الوسيلة متاحة للرقم الجديد.
 */
export class OtpChannelState {
  private readonly all = signal<OtpChannelOption[]>([]);
  private userChose = false;

  readonly selected = signal<OtpChannel>('Sms');
  readonly options = computed(() => this.all().filter(option => option.reason !== 'CHANNEL_DISABLED'));
  readonly showPicker = computed(() => this.options().length > 1);

  constructor(
    private readonly phoneAuth: PhoneAuthApiService,
    private readonly destroyRef: DestroyRef
  ) {}

  /** يبدأ تتبّع حقل الرقم. يُستدعى مرة واحدة من سياق حقن (حقل الصفحة). */
  watch(control: AbstractControl<string>): void {
    control.valueChanges
      .pipe(
        startWith(control.value),
        map(value => normalizePhoneInput(value)),
        // رقم ناقص = الصورة الخالية من الدولة؛ لا نُرسل أرقاماً غير مكتملة للباك أثناء الكتابة.
        map(phone => (PHONE_E164_PATTERN.test(phone) ? phone : '')),
        distinctUntilChanged(),
        debounceTime(350),
        switchMap(phone =>
          this.phoneAuth.getOtpChannels(phone || undefined).pipe(
            // فشل الجلب ليس خطأً للمستخدم: تبقى الواجهة القديمة (SMS فقط).
            catchError(() => {
              this.set([]);
              return EMPTY;
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(options => this.set(options));
  }

  /** اختيار المستخدم؛ يتجاهل وسيلة غير متاحة. */
  select(channel: OtpChannel): void {
    if (this.options().some(option => option.channel === channel && option.available)) {
      this.selected.set(channel);
      this.userChose = true;
    }
  }

  /** الوسائل المتاحة الأخرى غير التي أُرسل بها الرمز — لزر "لم يصلك الرمز؟". */
  alternativesTo(sent: OtpChannel): OtpChannelOption[] {
    return this.options().filter(option => option.available && option.channel !== sent);
  }

  private set(options: OtpChannelOption[]): void {
    this.all.set(options);

    const usable = options.filter(option => option.available && option.reason !== 'CHANNEL_DISABLED');
    const current = this.selected();
    if (this.userChose && usable.some(option => option.channel === current)) {
      return;
    }

    const next = usable.find(option => option.recommended) ?? usable[0];
    this.selected.set(next?.channel ?? 'Sms');
    if (!usable.some(option => option.channel === current)) {
      this.userChose = false;
    }
  }
}
