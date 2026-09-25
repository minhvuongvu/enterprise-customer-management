import { DEFAULT_AFTER_SIGN_IN, safeReturnUrl } from './return-url';

/**
 * The open-redirect defence. Each refused value is a real technique for
 * turning "sign in, then go back where you were" into "sign in, then go to the
 * attacker's copy of this page".
 */
describe('safeReturnUrl', () => {
  it.each(['/customers', '/customers/42/edit', '/customers?page=2&search=nguyen'])(
    'follows a path inside the application: %s',
    (url) => {
      expect(safeReturnUrl(url)).toBe(url);
    },
  );

  it.each([
    ['nothing', undefined],
    ['an empty value', ''],
    ['an absolute URL', 'https://evil.test/login'],
    ['a script URL', 'javascript:alert(1)'],
    ['a protocol-relative URL', '//evil.test'],
    ['a backslash the browser turns into a slash', '/\\evil.test'],
    ['a tab a URL parser strips', '/\t/evil.test'],
    ['a relative path', 'customers'],
    ['the sign-in page, which would loop', '/login?returnUrl=%2Fcustomers'],
  ])('falls back to the default for %s', (_label, url) => {
    expect(safeReturnUrl(url)).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});
