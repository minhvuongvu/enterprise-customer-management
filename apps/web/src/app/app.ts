import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component.
 *
 * Nothing but an outlet, and that is the point: the public routes and the
 * authenticated application have different chrome, so each branch of the route
 * tree brings its own. `AppShell` owns the header, navigation and the `<main>`
 * landmark for the authenticated area; `LoginPage` owns its own.
 *
 * A `<main>` here would have produced two of them on every authenticated page,
 * which is invalid HTML and makes "skip to main content" ambiguous.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {}
