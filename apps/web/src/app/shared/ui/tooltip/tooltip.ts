import {
  createFlexibleConnectedPositionStrategy,
  createOverlayRef,
  createRepositionScrollStrategy,
  OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  signal,
} from '@angular/core';

let nextId = 0;

/** The floating label itself. Private to the directive below. */
@Component({
  selector: 'app-tooltip-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="tooltip" role="tooltip" [id]="id()">{{ text() }}</div>`,
  styles: `
    .tooltip {
      max-width: 16rem;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      background-color: var(--surface-inverse);
      color: var(--text-inverse);
      font-size: var(--text-sm);
      line-height: var(--leading-tight);
      box-shadow: var(--shadow-md);
    }
  `,
})
export class TooltipContent {
  readonly text = input.required<string>();
  readonly id = input.required<string>();
}

/**
 * A short label shown on hover or focus.
 *
 * The rule that makes tooltips safe rather than harmful: **a tooltip is never
 * the only way to learn something**. It is `aria-describedby`, not
 * `aria-labelledby` - supplementary description, not the accessible name. An
 * icon-only control still carries its own visually hidden label; the tooltip
 * only repeats it for sighted mouse users.
 *
 * Focus opens it as well as hover, because a keyboard user has no pointer, and
 * Escape closes it, because a tooltip that covers the thing underneath it must
 * be dismissible without moving the mouse. Both are WCAG 1.4.13 requirements
 * and both are one line here.
 */
@Directive({
  selector: '[appTooltip]',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focus)': 'show()',
    '(blur)': 'hide()',
    '(keydown.escape)': 'hide()',
    '[attr.aria-describedby]': 'visible() ? tooltipId : null',
  },
})
export class Tooltip implements OnDestroy {
  /** Already translated. Empty text disables the tooltip entirely. */
  readonly text = input.required<string>({ alias: 'appTooltip' });
  readonly disabled = input(false, { alias: 'appTooltipDisabled' });

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  protected readonly tooltipId = `app-tooltip-${nextId++}`;
  protected readonly visible = signal(false);

  private overlayRef: OverlayRef | null = null;

  protected show(): void {
    if (this.overlayRef || this.disabled() || !this.text()) {
      return;
    }

    const positionStrategy = createFlexibleConnectedPositionStrategy(
      this.injector,
      this.host,
    ).withPositions([
      // Preferred: to the side, which is where the sidebar rail needs it.
      { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 8 },
      { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
      { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
    ]);

    this.overlayRef = createOverlayRef(this.injector, {
      positionStrategy,
      scrollStrategy: createRepositionScrollStrategy(this.injector),
    });

    const component = this.overlayRef.attach(new ComponentPortal(TooltipContent));
    component.setInput('text', this.text());
    component.setInput('id', this.tooltipId);

    this.visible.set(true);
  }

  protected hide(): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.visible.set(false);
  }

  ngOnDestroy(): void {
    // A tooltip outlives its trigger otherwise: the overlay lives in its own
    // container, outside the component tree being destroyed.
    this.hide();
  }
}
