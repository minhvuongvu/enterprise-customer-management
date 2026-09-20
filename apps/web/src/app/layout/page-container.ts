import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The column a page's content sits in.
 *
 * It exists so that "how wide is a page, and how much air is between its
 * sections" is answered once. The alternative - every page choosing its own
 * padding - is why enterprise applications drift into six slightly different
 * layouts that nobody decided on.
 *
 * The maximum width is a readability constraint, not a nostalgia for 1280px
 * monitors: a data table stretched across a 34-inch screen makes the eye lose
 * its row between the first column and the last.
 */
@Component({
  selector: 'app-page-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      width: 100%;
      max-width: var(--layout-content-max);
      margin: 0 auto;
    }
  `,
})
export class PageContainer {}
