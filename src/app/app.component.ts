import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { Observable, filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AuthService } from './core/auth/auth.service';
import { SessionRecoveryService } from './core/auth/session-recovery.service';
import { LanguageService } from './core/services/language.service';
import { PreferencesService } from './core/services/preferences.service';
import { PushRegistrationService } from './core/push/push-registration.service';
import { ToastContainerComponent } from './shared/ui/toast-container.component';
import { NativeBackButtonService } from './core/services/native-back-button.service';
import { DeepLinkService } from './core/deep-links/deep-link.service';
import { ThemeService } from './core/services/theme.service';
import { NotificationsApiService } from './core/api/notifications-api.service';
import { AppUpdateService, isTrustedStoreUrl } from './core/api/app-update.service';
import { ToastService } from './shared/services/toast.service';
import { ReferralCodeService } from './core/sharing/referral-code.service';
import { AttributionContextService } from './core/sharing/attribution-context.service';
import { ConfirmModalComponent } from './shared/ui/confirm-modal.component';
import { EnvironmentBadgeComponent } from './shared/ui/environment-badge.component';
import { AdsConsentBannerComponent } from './core/ads/ads-consent-banner.component';
import { MetaService } from './core/services/meta.service';
import { PageMetaService } from './core/services/page-meta.service';
import { ClientErrorReporterService } from './core/diagnostics/client-error-reporter.service';
import { installWindowErrorListeners } from './core/diagnostics/client-error-handler';
import { AppUpdateNativeGateway } from './core/api/app-update-native.gateway';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, ToastContainerComponent, ConfirmModalComponent, EnvironmentBadgeComponent, AdsConsentBannerComponent, TranslateModule],
  template: `
    <router-outlet></router-outlet>
    <app-toast-container></app-toast-container>
    <app-environment-badge></app-environment-badge>
    <app-ads-consent-banner></app-ads-consent-banner>

    <!-- App Update Management: تحديث اختياري — قابل للتجاهل، مرة واحدة لكل إقلاع تطبيق. -->
    <app-confirm-modal
      [open]="appUpdate.optionalUpdate() !== null"
      [closeOnBackdrop]="true"
      [title]="'APP_UPDATE.OPTIONAL_TITLE' | translate"
      [confirmLabel]="'APP_UPDATE.UPDATE_NOW' | translate"
      [cancelLabel]="'APP_UPDATE.LATER' | translate"
      (confirmed)="onUpdateNow(appUpdate.optionalUpdate()?.storeUrl)"
      (cancelled)="appUpdate.dismissOptionalUpdate()"
    >
      {{ appUpdate.optionalUpdate()?.releaseNotes || ('APP_UPDATE.OPTIONAL_BODY' | translate) }}
    </app-confirm-modal>

    <!-- تحديث إجباري — بلا زر إلغاء وبلا إغلاق بالنقر على الخلفية (hideCancel +
         closeOnBackdrop=false)؛ إذا لم يكن رابط المتجر مضبوطاً بعد يبقى زر "تحديث الآن"
         معطّلاً بدل أن يفعل لا شيء بصمت. -->
    <app-confirm-modal
      [open]="appUpdate.mandatoryUpdate() !== null"
      [closeOnBackdrop]="false"
      [hideCancel]="true"
      [confirmDisabled]="!hasTrustedStoreUrl(appUpdate.mandatoryUpdate()?.storeUrl)"
      [title]="'APP_UPDATE.MANDATORY_TITLE' | translate"
      [confirmLabel]="'APP_UPDATE.UPDATE_NOW' | translate"
      (confirmed)="onUpdateNow(appUpdate.mandatoryUpdate()?.storeUrl)"
    >
      {{ 'APP_UPDATE.MANDATORY_BODY' | translate }}
      @if (appUpdate.mandatoryUpdate()?.releaseNotes; as notes) {
        <p class="update-notes">{{ notes }}</p>
      }
    </app-confirm-modal>
  `,
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  readonly isLoggedIn$: Observable<boolean>;
  showAddButton = false;

  protected readonly appUpdate = inject(AppUpdateService);

  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly attributionContext = inject(AttributionContextService);
  private readonly referralCode = inject(ReferralCodeService);
  private readonly metaService = inject(MetaService);
  private readonly pageMeta = inject(PageMetaService);
  private readonly preferences = inject(PreferencesService);
  private readonly push = inject(PushRegistrationService);
  private readonly sessionRecovery = inject(SessionRecoveryService);
  private readonly errorReporter = inject(ClientErrorReporterService);
  private readonly nativeGateway = inject(AppUpdateNativeGateway);

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly languageService: LanguageService,
    nativeBackButton: NativeBackButtonService,
    deepLinks: DeepLinkService,
    themeService: ThemeService
  ) {
    this.isLoggedIn$ = this.authService.isLoggedIn$;
    this.languageService.getCurrent();
    this.preferences.start();
    this.push.start();
    // A bad connection at start-up or on return from the background must not look like a sign-out.
    this.sessionRecovery.start();
    nativeBackButton.initialize();
    deepLinks.initialize();
    this.appUpdate.initialize();
    this.metaService.applyGlobalRobotsPolicy();
    // Errors outside Angular's zone, plus the real app version on native builds (QA phase 21, D07).
    installWindowErrorListeners(this.errorReporter);
    if (this.nativeGateway.isNativePlatform()) {
      this.nativeGateway.getAppVersion().then(version => this.errorReporter.setAppVersion(version)).catch(() => undefined);
    }
    void themeService; // يُطبَّق الوضع الداكن/الفاتح فور إنشاء الخدمة (constructor)

    // Every page starts from the generic title/description in the UI language and replaces it with its
    // own; one that sets none no longer keeps the previous page's title or the Arabic one (QA P16-D06).
    // Only a change of PATH counts: filtering /properties changes the query string, not the page.
    let currentPath = '';
    this.router.events
      .pipe(filter((event): event is NavigationStart => event instanceof NavigationStart))
      .subscribe(event => {
        const nextPath = event.url.split(/[?#]/)[0] ?? event.url;
        if (nextPath !== currentPath) {
          currentPath = nextPath;
          this.pageMeta.resetToDefault();
        }
      });
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.pageMeta.refreshDefaultOnLanguageChange());

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        this.showAddButton = event.urlAfterRedirects.startsWith('/properties');

        // ✅ UTM / Attribution (Phase 2): capture happens here — the app root — for EVERY
        // route, not inside PropertyDetailPage or any other feature page. A shared property
        // link is only the most common landing page; wiring capture to the router instead of
        // to one page means it keeps working if/when other pages start being shared too, and
        // keeps this entirely out of any single feature component (same separation-of-concerns
        // rule Phase 1 applied to the share button itself). See AttributionContextService.
        this.attributionContext.captureFromUrl(window.location.href);
        this.referralCode.captureFromUrl(window.location.href);
        this.attributionContext.stripUtmParamsFromVisibleUrl();
      });

    // ✅ إصلاح جذري: خدمة الإشعارات اللحظية (SignalR) والـ Toast والعداد كانت
    // كلها جاهزة ومكتوبة بالكامل بـ NotificationsApiService، لكن لم يكن يستدعيها
    // أي شيء إطلاقًا إلا صفحة /notifications نفسها عند فتحها يدويًا — وبما إنه
    // لا يوجد أي رابط لهذه الصفحة بالـ navbar، كانت هذه الخدمة عمليًا معطَّلة
    // تمامًا لكل مستخدمي التطبيق. هذا هو المكان الصحيح لربطها: مكوّن الجذر،
    // موجود طوال عمر التطبيق بغض النظر عن الصفحة الحالية (ويب أو داخل تطبيق
    // الجوال Capacitor على حدٍّ سواء).
    this.isLoggedIn$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isLoggedIn => {
        if (isLoggedIn) {
          this.notificationsApi.connect();
          this.notificationsApi.getUnreadCount()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: count => this.notificationsApi.unreadCount.set(count),
              error: () => {}
            });
        } else {
          this.notificationsApi.disconnect();
          this.notificationsApi.unreadCount.set(0);
        }
      });

    // ✅ إشعار فوري (Toast) عند وصول أي إشعار جديد لحظيًا عبر SignalR — بما
    // فيها إشعارات "رسالة جديدة" (NewMessage) — بغض النظر عن الصفحة المفتوحة
    // حاليًا، وبنفس الطريقة سواء على المتصفح أو داخل تطبيق الجوال.
    this.notificationsApi.realtime$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(notification => {
        // The conversation is open on screen: the message is already visible, no toast on top of it.
        if (this.isViewingConversationOf(notification)) {
          // Seen as it arrived: mark it read (the server then syncs the badge on every device).
          if (notification.id) {
            this.notificationsApi.markAsRead(notification.id).subscribe({ error: () => undefined });
          }
          return;
        }
        this.toast.info(
          notification.message,
          this.translate.instant('NOTIFICATIONS.NEW_TOAST_TITLE')
        );
      });

    // ✅ إصلاح: notifySessionExpired() كانت تُطلَق فعلياً عند انتهاء جلسة حقيقية
    // (راجع تعليقها في auth.service.ts) لكن لم يكن يشترك بـ sessionExpired$ أي
    // شيء في التطبيق كله — فكان المستخدم يُعاد توجيهه لصفحة الدخول بصمت تام،
    // بلا أي رسالة تشرح السبب. هذا هو المكان الصحيح للاشتراك: مكوّن الجذر،
    // موجود طوال عمر التطبيق بغض النظر عن الصفحة الحالية.
    this.authService.sessionExpired$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(reason => {
        const key =
          reason === 'revoked' ? 'AUTH.ERRORS.SESSION_REVOKED'
          : reason === 'superseded' ? 'AUTH.ERRORS.SESSION_SUPERSEDED'
          : 'AUTH.ERRORS.SESSION_EXPIRED';
        this.toast.info(this.translate.instant(key));
      });
  }

  protected hasTrustedStoreUrl(storeUrl: string | null | undefined): boolean {
    return isTrustedStoreUrl(storeUrl);
  }

  protected onUpdateNow(storeUrl: string | null | undefined): void {
    void this.appUpdate.openStore(storeUrl);
  }

  /** True when a new-message notification belongs to the chat thread the person is looking at right now. */
  private isViewingConversationOf(notification: { type?: string; propertyId?: string | null }): boolean {
    if (notification.type !== 'NewMessage' || !notification.propertyId) {
      return false;
    }
    const path = this.router.url.split(/[?#]/)[0];
    return path === `/messages/${notification.propertyId}`;
  }
}
