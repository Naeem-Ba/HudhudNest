import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Observable, filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AuthService } from './core/auth/auth.service';
import { LanguageService } from './core/services/language.service';
import { PreferencesService } from './core/services/preferences.service';
import { PushRegistrationService } from './core/push/push-registration.service';
import { ToastContainerComponent } from './shared/ui/toast-container.component';
import { NativeBackButtonService } from './core/services/native-back-button.service';
import { DeepLinkService } from './core/deep-links/deep-link.service';
import { ThemeService } from './core/services/theme.service';
import { NotificationsApiService } from './core/api/notifications-api.service';
import { AppUpdateService } from './core/api/app-update.service';
import { ToastService } from './shared/services/toast.service';
import { AttributionContextService } from './core/sharing/attribution-context.service';
import { ConfirmModalComponent } from './shared/ui/confirm-modal.component';
import { EnvironmentBadgeComponent } from './shared/ui/environment-badge.component';
import { MetaService } from './core/services/meta.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, ToastContainerComponent, ConfirmModalComponent, EnvironmentBadgeComponent, TranslateModule],
  template: `
    <router-outlet></router-outlet>
    <app-toast-container></app-toast-container>
    <app-environment-badge></app-environment-badge>

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
      [confirmDisabled]="!appUpdate.mandatoryUpdate()?.storeUrl"
      [title]="'APP_UPDATE.MANDATORY_TITLE' | translate"
      [confirmLabel]="'APP_UPDATE.UPDATE_NOW' | translate"
      (confirmed)="onUpdateNow(appUpdate.mandatoryUpdate()?.storeUrl)"
    >
      {{ 'APP_UPDATE.MANDATORY_BODY' | translate }}
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
  private readonly metaService = inject(MetaService);
  private readonly preferences = inject(PreferencesService);
  private readonly push = inject(PushRegistrationService);

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
    nativeBackButton.initialize();
    deepLinks.initialize();
    this.appUpdate.initialize();
    this.metaService.applyGlobalRobotsPolicy();
    void themeService; // يُطبَّق الوضع الداكن/الفاتح فور إنشاء الخدمة (constructor)

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
        const key = reason === 'revoked' ? 'AUTH.ERRORS.SESSION_REVOKED' : 'AUTH.ERRORS.SESSION_EXPIRED';
        this.toast.info(this.translate.instant(key));
      });
  }

  protected onUpdateNow(storeUrl: string | null | undefined): void {
    void this.appUpdate.openStore(storeUrl);
  }
}
