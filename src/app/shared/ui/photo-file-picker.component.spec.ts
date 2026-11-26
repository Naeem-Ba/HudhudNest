import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import ar from '../../../../public/i18n/ar.json';
import de from '../../../../public/i18n/de.json';
import en from '../../../../public/i18n/en.json';
import tr from '../../../../public/i18n/tr.json';
import { PhotoFilePickerComponent, photoPickerSummaryKey } from './photo-file-picker.component';

@Component({
  standalone: true,
  imports: [PhotoFilePickerComponent],
  template: `<app-photo-file-picker [count]="count" [busy]="busy" (picked)="received.push($event)" />`
})
class HostComponent {
  count = 0;
  busy = false;
  received: File[][] = [];
}

describe('PhotoFilePickerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let translate: TranslateService;

  const status = (): string =>
    (fixture.nativeElement.querySelector('[data-testid="photo-picker-status"]') as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] }).compileComponents();
    translate = TestBed.inject(TranslateService);
    translate.setTranslation('ar', ar as never);
    translate.setTranslation('de', de as never);
    translate.setTranslation('en', en as never);
    translate.setTranslation('tr', tr as never);
    fixture = TestBed.createComponent(HostComponent);
  }

  async function render(lang: string, count: number, busy = false): Promise<string> {
    translate.use(lang);
    fixture.componentInstance.count = count;
    fixture.componentInstance.busy = busy;
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.count = count;
    fixture.componentInstance.busy = busy;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return status();
  }

  beforeEach(setup);

  it('picks the plural form from the language rules (Arabic has one/two/few/many)', () => {
    expect(photoPickerSummaryKey(0, 'ar')).toBe('PHOTO_PICKER.NONE');
    expect(photoPickerSummaryKey(1, 'ar')).toBe('PHOTO_PICKER.SELECTED_ONE');
    expect(photoPickerSummaryKey(2, 'ar')).toBe('PHOTO_PICKER.SELECTED_TWO');
    expect(photoPickerSummaryKey(3, 'ar')).toBe('PHOTO_PICKER.SELECTED_FEW');
    expect(photoPickerSummaryKey(10, 'ar')).toBe('PHOTO_PICKER.SELECTED_FEW');
    expect(photoPickerSummaryKey(11, 'ar')).toBe('PHOTO_PICKER.SELECTED_MANY');
    expect(photoPickerSummaryKey(1, 'de')).toBe('PHOTO_PICKER.SELECTED_ONE');
    expect(photoPickerSummaryKey(2, 'en')).toBe('PHOTO_PICKER.SELECTED_OTHER');
    expect(photoPickerSummaryKey(5, 'tr')).toBe('PHOTO_PICKER.SELECTED_OTHER');
    expect(photoPickerSummaryKey(4, 'not a language')).toBe('PHOTO_PICKER.SELECTED_OTHER');
  });

  it('shows the app-language text for no, one and several files in all four languages', async () => {
    expect(await render('ar', 0)).toContain('لم يتم اختيار صور');
    expect(await render('ar', 1)).toContain('تم اختيار صورة واحدة');
    expect(await render('ar', 2)).toContain('تم اختيار صورتين');
    expect(await render('ar', 4)).toContain('تم اختيار 4 صور');
    expect(await render('de', 0)).toContain('Keine Dateien ausgewählt');
    expect(await render('de', 1)).toContain('1 Datei ausgewählt');
    expect(await render('de', 3)).toContain('3 Dateien ausgewählt');
    expect(await render('en', 0)).toContain('No files selected');
    expect(await render('en', 1)).toContain('1 file selected');
    expect(await render('en', 3)).toContain('3 files selected');
    expect(await render('tr', 0)).toContain('Dosya seçilmedi');
    expect(await render('tr', 3)).toContain('3 dosya seçildi');
  });

  it('never shows German text under the Arabic UI, and shows the uploading text while busy', async () => {
    const arabic = await render('ar', 0);
    expect(arabic).not.toMatch(/keine|ausgewählt|datei/i);
    expect(await render('ar', 3, true)).toContain('جارٍ رفع الصور...');
    expect(await render('en', 3, true)).toContain('Uploading images...');
    expect(await render('de', 3, true)).toContain('Bilder werden hochgeladen...');
  });

  it('keeps the native input hidden, so the browser\'s own "no file chosen" text is never on screen', async () => {
    await render('ar', 0);
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.hidden).toBeTrue();
    expect(getComputedStyle(input).display).toBe('none');
  });

  it('reports a pick exactly once and clears the input so the same file can be chosen again', async () => {
    await render('en', 0);
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('change')); // a repeated event finds the input already cleared

    expect(fixture.componentInstance.received.length).toBe(1);
    expect(fixture.componentInstance.received[0].map(f => f.name)).toEqual(['a.png']);
    expect(input.files!.length).toBe(0);
  });

  it('ignores a pick while an upload is running', async () => {
    await render('en', 2, true);
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([1])], 'b.png', { type: 'image/png' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.received).toEqual([]);
    expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).disabled).toBeTrue();
  });
});
