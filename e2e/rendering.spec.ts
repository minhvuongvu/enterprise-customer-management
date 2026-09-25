import { expect, signInAs, test } from './fixtures';

/**
 * Phase 5: the rendering lab's specimens, in a browser (docs/rendering.md).
 *
 * What is asserted here is behaviour, not speed: that each specimen really is
 * rendered where it claims to be, and that the page works once the
 * JavaScript has arrived - whatever happened to the server's HTML on the way.
 * Speed is measured under controlled conditions by perf/measure-rendering.ts,
 * not in a test that runs in parallel with forty others.
 */
test.use({ signIn: false });

test.describe('rendering specimens', () => {
  test('the server-rendered and prerendered specimens arrive as HTML; the client one does not', async ({
    request,
  }) => {
    for (const path of ['/rendering-lab/server', '/rendering-lab/prerender']) {
      const html = await (await request.get(path)).text();
      expect(html, path).toContain('SPC-0400');
      // A crawler told not to index a lab page.
      expect(html, path).toMatch(/<meta name="robots" content="noindex">/);
    }

    const shell = await (await request.get('/rendering-lab/client')).text();
    expect(shell).not.toContain('SPC-0400');
  });

  for (const specimen of [
    'client',
    'server',
    'prerender',
    'prerender-no-hydration',
    'prerender-incremental',
  ]) {
    test(`${specimen}: the page is interactive and reports its own load`, async ({ page }) => {
      await page.goto(`/rendering-lab/${specimen}`);

      const counter = page.getByTestId('specimen-counter');
      await expect(page.getByTestId('metric-appStable')).not.toHaveText(/Not measured/);
      await counter.click();
      await expect(counter).toHaveText(/Clicked 1 times/);

      // The catalogue - below the fold, hydrated lazily in one specimen,
      // re-rendered in another - answers its buttons in every one.
      const show = page.getByRole('button', { name: 'Show' }).first();
      await show.scrollIntoViewIfNeeded();
      await show.click();
      await expect(page.getByRole('button', { name: 'Hide' })).toHaveCount(1);
    });
  }

  test('the lab page links to every specimen', async ({ page, context, baseURL }) => {
    await signInAs(context, baseURL ?? '', 'viewer');
    await page.goto('/technical-labs/rendering');

    for (const specimen of ['client', 'server', 'prerender']) {
      await expect(page.getByTestId(`specimen-${specimen}`)).toHaveAttribute(
        'href',
        `/rendering-lab/${specimen}`,
      );
    }
  });
});
