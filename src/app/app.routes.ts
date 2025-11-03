import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { WohnungenComponent } from './wohnungen/wohnungen.component';
import { WohnungDetailComponent } from './wohnung-detail/wohnung-detail.component';
import { LoginComponent } from './login/login.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'wohnungen', component: WohnungenComponent },
  { path: 'wohnungen/:id', component: WohnungDetailComponent },
  { path: 'login', component: LoginComponent },
  { path: '**', redirectTo: '' }
];


