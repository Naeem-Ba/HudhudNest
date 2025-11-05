import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WohnungenService, Wohnung } from '../services/wohnungen.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-wohnungen',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wohnungen.component.html',
})
export class WohnungenComponent implements OnInit {
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
