import { Injectable, Injector, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { BrandService } from './brand.service';

@Injectable()
export class StallTitleStrategy extends TitleStrategy {
  private title = inject(Title);
  // Resolved lazily: the Router builds this strategy, and BrandService's HTTP call
  // goes through the auth interceptor, which needs the Router (a DI cycle if eager).
  private injector = inject(Injector);

  override updateTitle(snapshot: RouterStateSnapshot) {
    const stall = this.injector.get(BrandService).stallName();
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} · ${stall}` : stall);
  }
}
