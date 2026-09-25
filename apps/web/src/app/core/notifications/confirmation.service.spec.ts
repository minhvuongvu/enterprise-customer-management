import { TestBed } from '@angular/core/testing';
import { ConfirmationService, type ConfirmationRequest } from './confirmation.service';

const DELETE: ConfirmationRequest = {
  headingKey: 'pages.customers.list.bulk.confirmHeading',
  bodyKey: 'pages.customers.list.bulk.confirmBody',
  confirmKey: 'pages.customers.list.bulk.delete',
  tone: 'danger',
};

describe('ConfirmationService', () => {
  let confirmation: ConfirmationService;

  beforeEach(() => {
    confirmation = TestBed.inject(ConfirmationService);
  });

  it('asks, and answers with what the user chose', () => {
    const answers: boolean[] = [];
    confirmation.confirm(DELETE).subscribe((answer) => answers.push(answer));

    expect(confirmation.pending()?.request).toBe(DELETE);
    confirmation.answer(true);

    expect(answers).toEqual([true]);
    expect(confirmation.pending()).toBeNull();
  });

  it('answers the first question "no" when a second is asked', () => {
    const first: boolean[] = [];
    const second: boolean[] = [];
    confirmation.confirm(DELETE).subscribe((answer) => first.push(answer));
    confirmation
      .confirm({ ...DELETE, confirmKey: 'common.save' })
      .subscribe((answer) => second.push(answer));

    // Two stacked modal questions are a design error; cancelling the older
    // one is the answer that loses nothing.
    expect(first).toEqual([false]);
    expect(confirmation.pending()?.request.confirmKey).toBe('common.save');

    confirmation.answer(true);
    expect(second).toEqual([true]);
  });

  it('withdraws the question when nobody is waiting for the answer any more', () => {
    const subscription = confirmation.confirm(DELETE).subscribe();
    subscription.unsubscribe();

    expect(confirmation.pending()).toBeNull();
  });
});
