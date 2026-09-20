import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section *transloco="let t">
      <h1>{{ t('pages.notFound.heading') }}</h1>
      <p>{{ t('pages.notFound.body') }}</p>
      <a routerLink="/">{{ t('pages.notFound.backHome') }}</a>
    </section>
  `,
})
export class NotFoundPage {}
