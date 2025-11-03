import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WohnungenService, Wohnung } from '../wohnungenservice';
import { Router } from '@angular/router';

@Component({
  selector: 'app-wohnungen',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './wohnungen.html',
})
export class Wohnungen implements OnInit {
  wohnungen: Wohnung[] = [];

  constructor(private wohnungenService: WohnungenService, private router: Router) {}

  ngOnInit(): void {
    this.wohnungenService.getWohnungen().subscribe(data => {
      this.wohnungen = data;
    });
    
  }
  gotoDetails(id: number) {
    // Navigiert zu einer Detail-Seite, z.B. /wohnungen/1
    this.router.navigate(['/wohnungen', id]);
  }
  
}
