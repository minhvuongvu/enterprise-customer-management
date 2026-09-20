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

  it('renders the routed view inside a main landmark', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    // A <main> landmark is the anchor for skip links and screen-reader
    // navigation; Phase 1's shell is built inside it.
    expect(root.querySelector('main')).not.toBeNull();
    expect(root.querySelector('router-outlet')).not.toBeNull();
  });
});
