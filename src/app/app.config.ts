import { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AuthInterceptor } from './services/auth-interceptor';


export const appConfig: ApplicationConfig = {
  providers: [
   // أضف withHashLocation() هنا كمعامل ثانٍ لدالة provideRouter
    provideRouter(routes, withHashLocation()),
    provideHttpClient(
      withInterceptors([
        AuthInterceptor
      ])
    )
  ]
};
