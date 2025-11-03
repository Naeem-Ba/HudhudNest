import { Routes, provideRouter } from '@angular/router';
import { Home } from './home/home';
import { Wohnungen } from './wohnungen/wohnungen';
import { WohnungDetail } from './wohnungen/wohnung-detail';
import { Login } from './login/login';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'wohnungen', component: Wohnungen },
  { path: 'wohnungen/:id', component: WohnungDetail },
  { path: 'login', component: Login },
  { path: '**', redirectTo: '' }
];
export const appConfig = {
  providers: [provideRouter(routes)]
};