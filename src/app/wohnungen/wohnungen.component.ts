import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WohnungenService, Wohnung } from '../services/wohnungen.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-wohnungen',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wohnungen.component.html',
})
export class WohnungenComponent implements OnInit {
  wohnungen: Wohnung[] = [];
  isLoggedIn$!: Observable<boolean>;
  constructor(
    private wohnungenService: WohnungenService,
    private router: Router,
    private authService: AuthService
  ) { this.isLoggedIn$ = this.authService.isLoggedIn$;}

  ngOnInit(): void {
  this.wohnungenService.getWohnungen().subscribe(data => {
    this.wohnungen = data;  // تأكد أن القائمة تتحدث بعد إضافة شقة جديدة
  });
}

  gotoDetails(id: number) {
    // Navigiert zu einer Detail-Seite, z.B. /wohnungen/1
    this.router.navigate(['/wohnungen', id]);
  }
  
}
