import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { WohnungenService, Wohnung } from '../services/wohnungen.service';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: `./home.component.html`
})
export class HomeComponent implements OnInit {
  wohnungen: Wohnung[] = [];

  constructor(private wohnungenService: WohnungenService) {}

  ngOnInit() {
    this.wohnungenService.getWohnungen().subscribe({
      next: data => this.wohnungen = data.reverse().slice(0, 6), // آخر 6 شقق
      error: err => console.error(err)
    });
  }
}