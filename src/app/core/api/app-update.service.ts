// خدمة App Update Management — تُشغَّل مرة واحدة عند إقلاع التطبيق (نفس نمط
// NativeBackButtonService.initialize()) وتستعلم من الخلفية عن توفر تحديث. لا تعمل إطلاقاً
// على الويب: لا يوجد مفهوم "إصدار مثبَّت" للويب (النشر مستمر ويقدّم دائماً أحدث نسخة) —
// راجع docs/app-update-management.md (repo الخلفية) قسم "Web" لهذا القرار. لا تُعطِّل
// إقلاع التطبيق أبداً: فشل الشبكة/الخادم يُبتلَع بصمت (catchError) تماماً كما يتطلب عقد
// GET /api/app-updates/check نفسه على الخلفية (fail-closed إلى "لا يوجد تحديث").
import { Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { catchError, defer, from, of, switchMap } from 'rxjs';

import { AppUpdateNativeGateway } from './app-update-native.gateway';
import { BackendApiService } from './backend-api.service';

export interface AppUpdateCheckDto {
  updateAvailable: boolean;
  mandatory: boolean;
  latestVersion: string | null;
  minimumSupportedVersion: string | null;
  storeUrl: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
}

/**
 * يحوّل رقم إصدار Capacitor الأصلي (App.getInfo().version) إلى الصيغة major.minor.patch
 * التي يتطلبها الـ backend حرفياً. ضروري لأن MARKETING_VERSION الحالي على iOS هو "1.0"
 * (قطعتان فقط) — الـ backend's AppVersion.TryParse يرفض أي شيء غير ثلاث قطع بالضبط
 * ويُعيد 422. القطع الناقصة تُكمَّل بأصفار؛ الزائدة تُقصّ لأول ثلاث قطع؛ أي قطعة غير رقمية
 * تُستبدَل بصفر بدل رمي استثناء يعطّل فحص التحديث بالكامل.
 */
export function normalizeAppVersion(raw: string | null | undefined): string {
  const segments = (raw ?? '').trim().split('.');
  const parts = [0, 1, 2].map(index => {
    const value = Number.parseInt(segments[index] ?? '', 10);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  });
  return parts.join('.');
}

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  /** غير null فقط عندما يكون التحديث إجبارياً (currentVersion أقل من minimumSupportedVersion). */
  readonly mandatoryUpdate = signal<AppUpdateCheckDto | null>(null);

  /** غير null فقط عندما يتوفر تحديث اختياري لم يُرفَض بعد في هذا الإقلاع. */
  readonly optionalUpdate = signal<AppUpdateCheckDto | null>(null);

  private initialized = false;

  constructor(
    private readonly api: BackendApiService,
    private readonly translate: TranslateService,
    private readonly native: AppUpdateNativeGateway
  ) {}

  /** يُستدعى مرة واحدة من AppComponent — لا يحجب أول رسم للتطبيق (ليس APP_INITIALIZER). */
  initialize(): void {
    if (this.initialized || !this.native.isNativePlatform()) {
      return;
    }

    this.initialized = true;

    defer(() => from(this.native.getAppVersion()))
      .pipe(
        switchMap(version => {
          const platform = this.native.getPlatform() === 'ios' ? 'IOS' : 'Android';
          return this.api.get<AppUpdateCheckDto>('/app-updates/check', {
            platform,
            currentVersion: normalizeAppVersion(version),
            lang: this.translate.currentLang || this.translate.defaultLang || 'ar'
          });
        }),
        catchError(() => of(null))
      )
      .subscribe(result => {
        if (!result) {
          return;
        }

        if (result.mandatory) {
          this.mandatoryUpdate.set(result);
        } else if (result.updateAvailable) {
          this.optionalUpdate.set(result);
        }
      });
  }

  /** "لاحقًا" — مرة واحدة لكل إقلاع تطبيق فقط (الحالة تُعاد تلقائياً عند إعادة إنشاء
   * الخدمة singleton في الإقلاع التالي، بلا أي تخزين دائم مطلوب). */
  dismissOptionalUpdate(): void {
    this.optionalUpdate.set(null);
  }

  /** لا تفعل شيئاً إن كان storeUrl غير موجود بعد (لا روابط متجر حقيقية بعد — راجع
   * docs/app-update-management.md) بدل تعطّل الزر أو رمي خطأ غير مفهوم للمستخدم. */
  async openStore(storeUrl: string | null | undefined): Promise<void> {
    if (!storeUrl) {
      return;
    }

    await this.native.openUrl(storeUrl);
  }
}
