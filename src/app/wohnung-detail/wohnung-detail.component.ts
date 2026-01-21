import { Component, OnInit} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { RouterModule } from '@angular/router';
import { WohnungenService,Wohnung} from '../services/wohnungen.service';
import { EnumTranslatePipe } from '../pipes/enum-translate.pipe';
import { TranslateModule } from '@ngx-translate/core';
import{ WohnungMapViewComponent}  from './wohnungMapView/wohnungMapView.component';
import { TranslateService } from '@ngx-translate/core';


@Component({
  selector: 'app-wohnung-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    EnumTranslatePipe,
    TranslateModule,
    WohnungMapViewComponent
  ],
  templateUrl: './wohnung-detail.component.html',
  styleUrls: ['./wohnung-detail.component.scss']

})
export class WohnungDetailComponent implements OnInit {
  
  wohnung!: Wohnung;
  currentIndex = 0;
  modalOpen = false;

  startX = 0;
  currentX = 0;
  isDragging = false;

  constructor(
    private route: ActivatedRoute,
    private wohnungenService: WohnungenService,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.wohnungenService.getWohnung(id).subscribe(w => {
      this.wohnung = w;
    });
  }
  getCurrentImageUrl() {
  if (!this.wohnung || !this.wohnung.Bilder || this.wohnung.Bilder.length === 0) {
    return '';
  }
  return this.wohnung.Bilder[this.currentIndex].Url;
}

  prev() {
    if (this.wohnung?.Bilder && this.currentIndex > 0) {
      this.currentIndex--;
    }
  }

  next() {
    if (this.wohnung?.Bilder && this.currentIndex < this.wohnung.Bilder.length - 1) {
      this.currentIndex++;
    }
  }

  dragStart(event: any) {
    this.isDragging = true;
    this.startX = event.type.includes('mouse')
      ? event.pageX
      : event.touches[0].clientX;
  }

  dragMove(event: any) {
    if (!this.isDragging) return;

    this.currentX = event.type.includes('mouse')
      ? event.pageX
      : event.touches[0].clientX;
  }

  dragEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;

    const diff = this.currentX - this.startX;

    if (diff > 70) this.prev();
    else if (diff < -70) this.next();
  }

openModal() {
  this.modalOpen = true;
}

closeModal() {
  this.modalOpen = false;
}

get isRTL(): boolean {
  return this.translate.currentLang === 'ar';
}


}
