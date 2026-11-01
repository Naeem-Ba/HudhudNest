import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { AnalyticsService } from '../../core/api/analytics.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { MarketInsightsDto, PropertyStatsDto } from '../../core/models/analytics.model';
import { Property } from '../../core/models/property.model';
import { ListingViewsPanelComponent } from './listing-views-panel.component';
import { LocalizedNumberPipe } from '../../shared/pipes/localized-number.pipe';

@Component({selector:'app-analytics-page',standalone:true,imports:[ LocalizedNumberPipe,CommonModule,ReactiveFormsModule,TranslateModule,ListingViewsPanelComponent],templateUrl:'./analytics.page.html',styleUrls:['./analytics.page.scss'],changeDetection:ChangeDetectionStrategy.OnPush})
export class AnalyticsPage implements OnInit{
 private readonly analytics=inject(AnalyticsService);private readonly propertiesApi=inject(PropertyApiService);private readonly destroyRef=inject(DestroyRef);
 readonly countryControl=new FormControl('SY',{nonNullable:true});readonly selectedPropertyId=new FormControl('',{nonNullable:true});readonly market=signal<MarketInsightsDto|null>(null);readonly properties=signal<Property[]>([]);readonly propertyStats=signal<PropertyStatsDto|null>(null);readonly loadingMarket=signal(false);readonly loadingProperties=signal(false);readonly error=signal('');
 ngOnInit():void{this.loadMarket();this.loadProperties();}
 loadMarket():void{this.loadingMarket.set(true);this.analytics.getMarketInsights(this.countryControl.value).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:v=>{this.market.set(v);this.loadingMarket.set(false)},error:()=>{this.error.set('ANALYTICS.LOAD_ERROR');this.loadingMarket.set(false)}})}
 loadProperties():void{this.loadingProperties.set(true);this.propertiesApi.getMyProperties().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:p=>{this.properties.set(p);this.loadingProperties.set(false);if(p[0]){this.selectedPropertyId.setValue(p[0].id);this.loadPropertyStats();}},error:()=>{this.loadingProperties.set(false)}})}
 loadPropertyStats():void{const id=this.selectedPropertyId.value;if(!id){this.propertyStats.set(null);return;}this.analytics.getPropertyStats(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:s=>this.propertyStats.set(s),error:()=>this.error.set('ANALYTICS.PROPERTY_ERROR')})}
}
