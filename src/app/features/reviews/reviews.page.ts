import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { ReviewService } from '../../core/api/review.service';
import { PropertyReviewSummaryDto } from '../../core/models/review.model';

@Component({ selector:'app-reviews-page', standalone:true, imports:[CommonModule,ReactiveFormsModule,TranslateModule], templateUrl:'./reviews.page.html', styleUrls:['./reviews.page.scss'], changeDetection:ChangeDetectionStrategy.OnPush })
export class ReviewsPage implements OnInit {
  private readonly api=inject(ReviewService); private readonly route=inject(ActivatedRoute); private readonly router=inject(Router); private readonly destroyRef=inject(DestroyRef);
  readonly propertyIdControl=new FormControl('',{nonNullable:true,validators:[Validators.required]});
  readonly summary=signal<PropertyReviewSummaryDto|null>(null); readonly loading=signal(false); readonly error=signal('');
  ngOnInit():void{const id=this.route.snapshot.paramMap.get('propertyId')||this.route.snapshot.queryParamMap.get('propertyId')||''; if(id){this.propertyIdControl.setValue(id);this.load();}}
  load():void{if(this.propertyIdControl.invalid)return;const id=this.propertyIdControl.value.trim();this.loading.set(true);this.error.set('');void this.router.navigate([], {relativeTo:this.route,queryParams:{propertyId:id},queryParamsHandling:'merge',replaceUrl:true});this.api.getPropertyReviewSummary(id,1,50).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:s=>{this.summary.set(s);this.loading.set(false)},error:()=>{this.error.set('REVIEWS.LOAD_ERROR');this.loading.set(false)}})}
  stars(rating:number):number[]{return Array.from({length:5},(_,i)=>i<Math.round(rating)?1:0)}
}
