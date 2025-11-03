import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';

import { AppComponent } from './app';
import { Wohnungen } from './wohnungen/wohnungen';
import { WohnungDetail } from './wohnungen/wohnung-detail';
import { AppRoutingModule } from './app-routing.module';

@NgModule({

  imports: [
   BrowserModule,
    AppRoutingModule,
    AppComponent,       
    Wohnungen, 
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
