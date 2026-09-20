import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('is an outlet and nothing else', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('router-outlet')).not.toBeNull();

    // The `<main>` landmark belongs to whichever branch of the route tree is
    // active - the shell for the authenticated area, the login page for the
    // public one. One here would make every authenticated page have two, and
    // "skip to main content" ambiguous. `app-shell.spec.ts` asserts the
    // landmark exists where it belongs.
    expect(root.querySelector('main')).toBeNull();
  });
});
