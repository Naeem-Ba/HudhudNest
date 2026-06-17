// =====================================================================
// ✅ FIX #8 – main.ts (مُبسَّط)
// المشكلة: main.ts يُعرِّف providers مكررة موجودة في app.config.ts
// الحل: main.ts يستورد appConfig فقط ولا يُعرِّف providers خاصة به
//
// ⚠️  تأكد أن app.config.ts يحتوي على كل الإعدادات (راجع app.config.ts أدناه)
// =====================================================================
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch(console.error);
