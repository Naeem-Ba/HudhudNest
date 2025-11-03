import { Component, OnInit  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { WohnungenService, Wohnung } from '../wohnungenservice';

@Component({
  selector: 'app-wohnung-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './wohnung-detail.html',

})
export class WohnungDetail implements OnInit {
  wohnung?: Wohnung;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private wohnungenService: WohnungenService
  ) {}

  ngOnInit() {
    // ID aus der URL holen
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.wohnungenService.getWohnung(id).subscribe((data) => {
      this.wohnung = data;
    });
  }
  isLast(item: any, array: any[]) {
  return array.indexOf(item) === array.length - 1;
}
}
