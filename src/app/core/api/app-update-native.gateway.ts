// حاجز رقيق حول ثلاث استدعاءات Capacitor أصلية (Capacitor.isNativePlatform/getPlatform،
// App.getInfo، Browser.open). AppUpdateService يعتمد عليه بدل استيراد @capacitor/app و
// @capacitor/browser مباشرة، لسببين: (1) قابلية اختبار حقيقية — App وBrowser كلاهما
// كائنات مُنشأة عبر Capacitor's registerPlugin() وهي Proxy داخلياً، وjasmine's spyOn لا
// يعترضها بشكل موثوق (المحاولة الأولى لاختبار AppUpdateService عبر spyOn(App, 'getInfo')
// فشلت بصمت: السجلّ الحقيقي غير المموَّه كان يُستدعى فعلياً)؛ الحقن عبر Angular DI
// (useValue في الاختبارات) يتفادى المشكلة كلياً. (2) نفس مبدأ BackendApiService: طبقة
// نداء واحدة رقيقة قابلة لإعادة الاستخدام بدل تكرار المنطق الأصلي في كل خدمة تحتاجه.
import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class AppUpdateNativeGateway {
  isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }

  getPlatform(): string {
    return Capacitor.getPlatform();
  }

  getAppVersion(): Promise<string> {
    return App.getInfo().then(info => info.version);
  }

  openUrl(url: string): Promise<void> {
    return Browser.open({ url });
  }
}
