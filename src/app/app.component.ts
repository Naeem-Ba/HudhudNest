import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Observable, filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';

import { AuthService } from './core/auth/auth.service';
import { LanguageService } from './core/services/language.service';
import { ToastContainerComponent } from './shared/ui/toast-container.component';
import { NativeBackButtonService } from './core/services/native-back-button.service';
import { ThemeService } from './core/services/theme.service';
import { NotificationsApiService } from './core/api/notifications-api.service';
import { ToastService } from './shared/services/toast.service';
import { AttributionContextService } from './core/sharing/attribution-context.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, ToastContainerComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast-container></app-toast-container>
  `,
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  readonly isLoggedIn$: Observable<boolean>;
  showAddButton = false;

  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly attributionContext = inject(AttributionContextService);

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly languageService: LanguageService,
    nativeBackButton: NativeBackButtonService,
    themeService: ThemeService
  ) {
    this.isLoggedIn$ = this.authService.isLoggedIn$;
    this.languageService.getCurrent();
    nativeBackButton.initialize();
    void themeService; // يُطبَّق الوضع الداكن/الفاتح فور إنشاء الخدمة (constructor)

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        this.showAddButton = event.urlAfterRedirects.startsWith('/wohnungen');

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
  }
}
