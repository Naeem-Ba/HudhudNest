import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { WohnungenService, Wohnung } from '../services/wohnungen.service';
import { EnumTranslatePipe } from '../pipes/enum-translate.pipe';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CommonModule, EnumTranslatePipe, TranslateModule],
  templateUrl: `./home.component.html`,
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  wohnungen: Wohnung[] = [];

  constructor(private wohnungenService: WohnungenService) {}

  ngOnInit() {
    this.wohnungenService.getWohnungen().subscribe({
    next: data => {
      // ترتيب حسب المعرف (الأحدث أولاً) وأخذ أول 6
      this.wohnungen = data
        .sort((a, b) => (b.Id || 0) - (a.Id || 0))
        .slice(0, 6);
    },
    error: err => console.error('Error fetching latest properties', err)
  });
  }
}