import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-offline-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="offline-page" dir="rtl">
      <div class="card">
        <h1>&#1571;&#1606;&#1578; &#1594;&#1610;&#1585; &#1605;&#1578;&#1589;&#1604; &#1576;&#1575;&#1604;&#1573;&#1606;&#1578;&#1585;&#1606;&#1578;</h1>
        <p>&#1578;&#1581;&#1602;&#1602; &#1605;&#1606; &#1575;&#1604;&#1575;&#1578;&#1589;&#1575;&#1604; &#1579;&#1605; &#1581;&#1575;&#1608;&#1604; &#1605;&#1585;&#1577; &#1571;&#1582;&#1585;&#1609;.</p>
        <a routerLink="/home">&#1575;&#1604;&#1593;&#1608;&#1583;&#1577; &#1573;&#1604;&#1609; &#1575;&#1604;&#1585;&#1574;&#1610;&#1587;&#1610;&#1577;</a>
      </div>
    </section>
  `,
  styles: [`
    .offline-page{min-height:70vh;display:grid;place-items:center;background:var(--page-bg);padding:2rem}
    .card{background:var(--surface);padding:2rem;border-radius:16px;box-shadow:var(--shadow-lg);text-align:center}
    a{display:inline-block;margin-top:1rem;color:var(--gray-800);font-weight:700}
  `]
})
export class OfflinePage {}
