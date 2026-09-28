import { createBlockScrollStrategy } from '@angular/cdk/overlay';
import { DestroyRef, effect, inject, Injector, type Signal } from '@angular/core';

/**
 * Stops the page behind a modal from scrolling while `active` is true.
 *
 * A modal that lets the page scroll underneath it is disorienting on a
 * desktop and broken on a phone, where the swipe meant for the dialog's
 * content scrolls the list behind it instead - and on close the user is
 * somewhere else in the page. Two callers need it: `app-dialog` and the
 * shell's mobile navigation drawer (debt row 9).
 *
 * CDK's block strategy does the work - it pins `<html>` with the page's
 * current scroll offset and restores both on release, which is the part a
 * hand-written `overflow: hidden` gets wrong (the page jumps to the top). It
 * is used on its own, without an overlay: the dialog still renders inline,
 * because its only host (`ConfirmationHost`) sits at the root of the shell,
 * where no ancestor has the `transform` that would break `position: fixed`.
 *
 * Call it from an injection context. Released automatically on destroy, so a
 * modal removed while open never leaves the page frozen.
 */
export function lockScrollWhile(active: Signal<boolean>): void {
  const strategy = createBlockScrollStrategy(inject(Injector));
  let locked = false;

  const release = () => {
    if (locked) {
      strategy.disable();
      locked = false;
    }
  };

  effect(() => {
    if (active() && !locked) {
      strategy.enable();
      locked = true;
    } else if (!active()) {
      release();
    }
  });

  inject(DestroyRef).onDestroy(release);
}
