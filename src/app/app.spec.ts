import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AppComponent } from './app.component';

// ✅ إصلاح (كان ٢/٥٤ فاشلَين): AppComponent يحقن NotificationsApiService، الذي يحقن
// BackendApiService، الذي يحقن HttpClient حقيقياً -- بلا أي مزوّد له هنا كانت
// TestBed تفشل بـ NG0201. provideHttpClientTesting() تمنع أيضاً أي طلب شبكة حقيقي
// إن حاول المكوّن إطلاق واحد أثناء detectChanges(). راجع الحرج ٥ في
// RELEASE-BLOCKERS-AR.md.
describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AppComponent,
        TranslateModule.forRoot()
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    expect(app).toBeTruthy();
  });

  it('should render router-outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
