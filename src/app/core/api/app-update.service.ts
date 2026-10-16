// خدمة App Update Management — تُشغَّل مرة واحدة عند إقلاع التطبيق (نفس نمط
// NativeBackButtonService.initialize()) وتستعلم من الخلفية عن توفر تحديث. لا تعمل إطلاقاً
// على الويب: لا يوجد مفهوم "إصدار مثبَّت" للويب (النشر مستمر ويقدّم دائماً أحدث نسخة) —
// راجع docs/app-update-management.md (repo الخلفية) قسم "Web" لهذا القرار. لا تُعطِّل
// إقلاع التطبيق أبداً: فشل الشبكة/الخادم يُبتلَع بصمت (catchError) تماماً كما يتطلب عقد
// GET /api/app-updates/check نفسه على الخلفية (fail-closed إلى "لا يوجد تحديث").
import { Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { catchError, defer, finalize, from, of, switchMap } from 'rxjs';

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

/** Hosts a store link may point to. The API enforces the same list when a release is saved; the
 * client checks again because it is the one that opens the link. */
const TRUSTED_STORE_HOSTS = ['play.google.com', 'apps.apple.com', 'itunes.apple.com'];

export function isTrustedStoreUrl(raw: string | null | undefined): raw is string {
  if (!raw) {
    return false;
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && TRUSTED_STORE_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

/** After a successful check the next one waits this long; coming back from the background ten times
 * in an hour sends one request, not ten. */
export const UPDATE_CHECK_MIN_INTERVAL_MS = 60 * 60 * 1000;
/** After a failed check (offline, 5xx) a later resume may retry after this shorter wait. */
export const UPDATE_CHECK_RETRY_INTERVAL_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  /** غير null فقط عندما يكون التحديث إجبارياً (currentVersion أقل من minimumSupportedVersion). */
  readonly mandatoryUpdate = signal<AppUpdateCheckDto | null>(null);

  /** غير null فقط عندما يتوفر تحديث اختياري لم يُرفَض بعد في هذا الإقلاع. */
  readonly optionalUpdate = signal<AppUpdateCheckDto | null>(null);

  private initialized = false;
  private inFlight = false;
  private lastSuccessAt: number | null = null;
  private lastAttemptAt: number | null = null;
  /** Version the user dismissed with "Later" in this process; asked again only for a newer one. */
  private dismissedVersion: string | null = null;

  constructor(
    private readonly api: BackendApiService,
    private readonly translate: TranslateService,
    private readonly native: AppUpdateNativeGateway
  ) {}

  /** يُستدعى مرة واحدة من AppComponent — لا يحجب أول رسم للتطبيق (ليس APP_INITIALIZER).
   * يفحص عند الإقلاع ثم عند كل عودة من الخلفية، بلا مؤقتات ولا polling. */
  initialize(): void {
    if (this.initialized || !this.native.isNativePlatform()) {
      return;
    }

    this.initialized = true;
    this.native.onResume(() => this.check());
    this.check();
  }

  private check(): void {
    const now = Date.now();
    if (this.inFlight) {
      return;
    }
    if (this.lastSuccessAt !== null && now - this.lastSuccessAt < UPDATE_CHECK_MIN_INTERVAL_MS) {
      return;
    }
    if (this.lastAttemptAt !== null && now - this.lastAttemptAt < UPDATE_CHECK_RETRY_INTERVAL_MS) {
      return;
    }

    this.inFlight = true;
    this.lastAttemptAt = now;

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
        catchError(() => of(null)),
        finalize(() => (this.inFlight = false))
      )
      .subscribe(result => {
        // A failed check changes nothing: an outage of the update service alone never forces an
        // update, and never removes a dialog the server already asked for.
        if (!result) {
          return;
        }

        this.lastSuccessAt = Date.now();
        this.apply(result);
      });
  }

  private apply(result: AppUpdateCheckDto): void {
    // The server's answer replaces the previous one: a mandatory dialog disappears when the release
    // that raised the minimum was disabled, without restarting the app.
    this.mandatoryUpdate.set(result.mandatory ? result : null);

    const optional =
      !result.mandatory && result.updateAvailable && result.latestVersion !== this.dismissedVersion;
    this.optionalUpdate.set(optional ? result : null);
  }

  /** "لاحقًا" — مرة واحدة لكل إقلاع تطبيق فقط (الحالة تُعاد تلقائياً عند إعادة إنشاء
   * الخدمة singleton في الإقلاع التالي، بلا أي تخزين دائم مطلوب). */
  dismissOptionalUpdate(): void {
    this.dismissedVersion = this.optionalUpdate()?.latestVersion ?? null;
    this.optionalUpdate.set(null);
  }

  /** لا تفعل شيئاً إن كان storeUrl غير موجود بعد (لا روابط متجر حقيقية بعد — راجع
   * docs/app-update-management.md) بدل تعطّل الزر أو رمي خطأ غير مفهوم للمستخدم. */
  async openStore(storeUrl: string | null | undefined): Promise<void> {
    if (!isTrustedStoreUrl(storeUrl)) {
      return;
    }

    await this.native.openUrl(storeUrl);
  }
}
