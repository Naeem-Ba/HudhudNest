import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WohnungenService, Wohnung } from '../services/wohnungen.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { Observable } from 'rxjs';
import { EnumTranslatePipe } from '../pipes/enum-translate.pipe';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { EnumService } from '../services/enum.service'; 

@Component({
  selector: 'app-wohnungen',
  standalone: true,
  imports: [CommonModule, FormsModule, EnumTranslatePipe, TranslateModule, LanguageSelectorComponent],
  templateUrl: './wohnungen.component.html',
  styleUrls: ['./wohnungen.component.scss']
})
export class WohnungenComponent implements OnInit {
  wohnungen: Wohnung[] = [];
  isLoggedIn$!: Observable<boolean>;
  constructor(
    private wohnungenService: WohnungenService,
    private router: Router,
    private authService: AuthService,
    private enumService: EnumService,
    private translate: TranslateService
  ) { this.isLoggedIn$ = this.authService.isLoggedIn$;}

  ngOnInit(): void {

   // تحميل الشقق من السيرفر أول مرة
  this.wohnungenService.getWohnungen().subscribe(data => {
    console.log('📦 Wohnungen vom Server:', data);
    this.wohnungen = data;
  });

  // 🔁 عند إضافة شقة جديدة، تُضاف محليًا مباشرة
  this.wohnungenService.wohnungAdded$.subscribe(neueWohnung => {
    this.wohnungen.push(neueWohnung);
  });
}

  gotoDetails(id: number) {
    // Navigiert zu einer Detail-Seite, z.B. /wohnungen/1
    this.router.navigate(['/wohnungen', id]);
  }
  
}
