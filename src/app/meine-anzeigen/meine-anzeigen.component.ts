import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule} from '@angular/router';
import { WohnungenService ,Wohnung} from '../services/wohnungen.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './meine-anzeigen.component.html',
  styleUrls: ['./meine-anzeigen.component.scss']
})
export class MeineAnzeigenComponent implements OnInit {

  wohnungen: Wohnung[] = [];
  now = new Date();

  constructor(
    private service: WohnungenService,
    private router: Router
  ) {}

  ngOnInit() {
    this.service.getMyWohnungen().subscribe(res => {
      this.wohnungen = res;
    });
  }

  edit(id: number) {
    this.router.navigate(['/wohnungen/edit', id]);
  }

  delete(id: number) {
    if (!confirm('Anzeige wirklich löschen?')) return;

    this.service.deleteWohnung(id).subscribe(() => {
      this.wohnungen = this.wohnungen.filter(w => w.Id !== id);
    });
  }

  daysLeft(exp: string) {
    const diff = new Date(exp).getTime() - this.now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
}
