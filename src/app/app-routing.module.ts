import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Wohnungen } from './wohnungen/wohnungen';
import { WohnungDetail } from './wohnungen/wohnung-detail';

const routes: Routes = [
  { path: '', component: Wohnungen},
  { path: 'wohnung/:id', component: WohnungDetail },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
