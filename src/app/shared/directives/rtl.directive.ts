import { Directive, ElementRef, Input, OnChanges } from '@angular/core';

@Directive({
  selector: '[appRtl]',
  standalone: true
})
export class RtlDirective implements OnChanges {
  @Input() appRtl: boolean | string | null = true;

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    const enabled = this.appRtl === true || this.appRtl === 'true' || this.appRtl === 'rtl';
    this.elementRef.nativeElement.dir = enabled ? 'rtl' : 'ltr';
    this.elementRef.nativeElement.style.textAlign = enabled ? 'right' : 'left';
  }
}
