import { Component } from '@angular/core';
import { FormControl } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { LocationComboComponent } from './location-combo.component';

@Component({
  standalone: true,
  imports: [LocationComboComponent],
  template: `
    <label for="districtId">District</label>
    <app-location-combo inputId="districtId" [options]="[]" [idControl]="idCtrl" [textControl]="textCtrl"></app-location-combo>
  `
})
class HostComponent {
  idCtrl = new FormControl<number | null>(null);
  textCtrl = new FormControl<string | null>(null);
}

describe('LocationComboComponent', () => {
  it('puts inputId on the inner input so a <label for> labels a real control', () => {
    TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input#districtId') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect((fixture.nativeElement.querySelector('label') as HTMLLabelElement).control).toBe(input);
  });
});
