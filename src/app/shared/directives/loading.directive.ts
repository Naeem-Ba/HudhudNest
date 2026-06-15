import { Directive, HostBinding, Input } from '@angular/core';

@Directive({
  selector: '[appLoading]',
  standalone: true
})
export class LoadingDirective {
  @Input('appLoading') isLoading = false;

  @HostBinding('class.is-loading')
  get loadingClass(): boolean {
    return this.isLoading;
  }

  @HostBinding('attr.aria-busy')
  get ariaBusy(): string {
    return String(this.isLoading);
  }
}
