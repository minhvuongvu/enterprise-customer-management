import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component.
 *
 * Intentionally almost empty. The application shell - header, navigation,
 * breadcrumbs, responsive layout - is Phase 1's work; putting a provisional
 * version here would only have to be deleted.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {}
