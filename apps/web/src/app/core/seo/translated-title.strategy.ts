import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { combineLatest, map, switchMap } from 'rxjs';

/** Separates the page from the application name in the document title. */
const TITLE_SEPARATOR = ' · ';

/**
 * Route titles, translated (ADR-0009).
 *
 * Angular's default strategy writes `route.title` into the document verbatim.
 * That is a hardcoded user-facing string in every route file - the exact thing
 * rule 1 forbids - so routes carry a translation *key* instead and this
 * strategy resolves it.
 *
 * Two things make it more than a one-line override:
 *
 *  - the title is applied through `selectTranslate`, so a navigation that
 *    happens before the language chunk has loaded still ends up with a real
 *    title instead of the raw key;
 *  - it re-applies on language change, which is what keeps the browser tab in
 *    the user's language after Phase 6 adds a second one.
 */
@Injectable()
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);

  /** The key for the current route, or `null` for a route without a title. */
  private readonly titleKey = signal<string | null>(null);

  constructor() {
    super();

    toObservable(this.titleKey)
      .pipe(
        switchMap((key) => this.resolve(key)),
        takeUntilDestroyed(),
      )
      .subscribe((title) => this.title.setTitle(title));
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    // `buildTitle` walks to the deepest route that declares a title, which is
    // why a child route overrides its parent's without either one knowing.
    this.titleKey.set(this.buildTitle(snapshot) ?? null);
  }

  private resolve(key: string | null) {
    const appName$ = this.transloco.selectTranslate<string>('app.title');
    if (key === null) {
      return appName$;
    }

    return combineLatest([this.transloco.selectTranslate<string>(key), appName$]).pipe(
      map(([page, appName]) => `${page}${TITLE_SEPARATOR}${appName}`),
    );
  }
}
