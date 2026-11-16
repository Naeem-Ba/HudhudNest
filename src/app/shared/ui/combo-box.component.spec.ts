import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import { ComboBoxComponent, ComboOption } from './combo-box.component';

@Component({
  standalone: true,
  imports: [ComboBoxComponent, FormsModule],
  template: `
    <app-combo-box
      inputId="c" [options]="options" [(ngModel)]="picked" [allowCustom]="allowCustom" [disabled]="disabled"
      (customText)="custom = $event"
    ></app-combo-box>`
})
class HostComponent {
  options: ComboOption[] = [
    { value: 1, label: 'دمشق' },
    { value: 2, label: 'حلب' },
    { value: 3, label: 'حمص' }
  ];
  picked: string | number | null = null;
  custom: string | null = null;
  allowCustom = false;
  disabled = false;
}

describe('ComboBoxComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const input = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const toggle = () => fixture.nativeElement.querySelector('.combo__toggle') as HTMLButtonElement;
  const labels = () =>
    Array.from(fixture.nativeElement.querySelectorAll('.combo__option') as NodeListOf<HTMLElement>).map(e => e.textContent!.trim());
  const type = (text: string) => {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the whole list when the arrow is pressed', () => {
    toggle().click();
    fixture.detectChanges();
    expect(labels()).toEqual(['دمشق', 'حلب', 'حمص']);
  });

  it('shows the whole list again from the arrow even when a value is already chosen', async () => {
    host.picked = 2;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(input().value).toBe('حلب');

    toggle().click();
    fixture.detectChanges();
    expect(labels().length).toBe(3);
  });

  it('opens on focus or click of the field', () => {
    input().dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(labels().length).toBe(3);
  });

  it('narrows the list while typing, ignoring Arabic spelling variants', () => {
    type('حم');
    expect(labels()).toEqual(['حمص']);
    type('دمشق');
    expect(labels()).toEqual(['دمشق']);
  });

  it('writes the chosen option to the model and shows its label', () => {
    toggle().click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelectorAll('.combo__option')[1] as HTMLElement).click();
    fixture.detectChanges();
    expect(host.picked).toBe(2);
    expect(input().value).toBe('حلب');
    expect(fixture.nativeElement.querySelector('.combo__panel')).toBeNull();
  });

  it('treats typing an exact option name as choosing it', () => {
    type('حلب');
    expect(host.picked).toBe(2);
  });

  it('keeps typed text that is not an option only when custom text is allowed', () => {
    host.allowCustom = true;
    fixture.detectChanges();
    type('حي الميدان');
    expect(host.picked).toBeNull();
    expect(host.custom).toBe('حي الميدان');
    expect(fixture.nativeElement.querySelector('.combo__empty')).not.toBeNull();
  });

  it('reports no custom text when the typed text is an option or empty', () => {
    host.allowCustom = true;
    fixture.detectChanges();
    type('حي');
    type('دمشق');
    expect(host.custom).toBeNull();
    type('');
    expect(host.custom).toBeNull();
  });

  it('discards text that is not an option on blur when custom text is not allowed', async () => {
    type('xyz');
    input().dispatchEvent(new Event('blur'));
    await new Promise(r => setTimeout(r, 150));
    fixture.detectChanges();
    expect(input().value).toBe('');
    expect(host.picked).toBeNull();
  });

  it('keeps typed custom text on blur', async () => {
    host.allowCustom = true;
    fixture.detectChanges();
    type('الشعلان');
    input().dispatchEvent(new Event('blur'));
    await new Promise(r => setTimeout(r, 150));
    fixture.detectChanges();
    expect(input().value).toBe('الشعلان');
  });

  it('is operable with the keyboard', () => {
    // The first press opens the list and highlights its first entry.
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(host.picked).toBe(1);

    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.combo__panel')).toBeNull();
  });

  it('exposes combobox roles', () => {
    expect(input().getAttribute('role')).toBe('combobox');
    toggle().click();
    fixture.detectChanges();
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[role="option"]').length).toBe(3);
  });

  it('does not open when disabled', () => {
    host.disabled = true;
    fixture.detectChanges();
    toggle().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.combo__panel')).toBeNull();
  });

  it('relabels the chosen value when the options change (language switch)', async () => {
    host.picked = 1;
    fixture.detectChanges();
    await fixture.whenStable();
    host.options = [{ value: 1, label: 'Damascus' }, { value: 2, label: 'Aleppo' }];
    fixture.detectChanges();
    expect(input().value).toBe('Damascus');
  });

  it('does not wipe text being typed when the options arrive late', () => {
    host.allowCustom = true;
    host.options = [];
    fixture.detectChanges();
    type('الميدان');
    host.options = [{ value: 1, label: 'دمشق' }];
    fixture.detectChanges();
    expect(input().value).toBe('الميدان');
  });
});
