import { expect, test } from './fixtures';

/**
 * Phase 5: the technical labs, driven in a real browser.
 *
 * These are **browser-integration** tests: each exercises a browser API
 * itself - storage that survives a reload, IndexedDB, the clipboard,
 * geolocation, a Web Worker, the offline switch - because a unit test would
 * be testing a fake of exactly the thing in question. The logic around each
 * API (parsing, mapping, the election algorithm) is unit-tested next to its
 * code; docs/testing-strategy.md has the split.
 */

test.describe('lab index', () => {
  test('lists every lab, and each one opens', async ({ page }) => {
    await page.goto('/technical-labs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Technical labs');

    await page.getByRole('link', { name: /Offline and connectivity/ }).click();
    await expect(page).toHaveURL(/\/technical-labs\/offline$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Offline and connectivity');
  });
});

test.describe('browser storage lab', () => {
  test('localStorage survives a new tab; sessionStorage does not', async ({ page, context }) => {
    await page.goto('/technical-labs/browser-storage');
    await page.getByTestId('storage-value').getByRole('textbox').fill('kept');
    await page.getByTestId('save-local').click();
    await page.getByTestId('save-session').click();

    await page.reload();
    await expect(page.getByTestId('local-value')).toHaveText('kept');
    await expect(page.getByTestId('session-value')).toHaveText('kept');

    const other = await context.newPage();
    await other.goto('/technical-labs/browser-storage');
    await expect(other.getByTestId('local-value')).toHaveText('kept');
    await expect(other.getByTestId('session-value')).toHaveText('(empty)');
  });

  test('another tab hears about a localStorage write', async ({ page, context }) => {
    await page.goto('/technical-labs/browser-storage');
    const other = await context.newPage();
    await other.goto('/technical-labs/browser-storage');
    // \`goto\` resolves on the load event, before the lazy page exists and has
    // subscribed. A write before then is simply not an event for it.
    await expect(other.getByTestId('local-value')).toBeVisible();

    await page.getByTestId('storage-value').getByRole('textbox').fill('announced');
    await page.getByTestId('save-local').click();

    await expect(other.getByTestId('storage-events')).toContainText('announced');
    await expect(other.getByTestId('local-value')).toHaveText('announced');
  });

  test('IndexedDB notes survive a reload', async ({ page }) => {
    await page.goto('/technical-labs/browser-storage');
    await page.getByTestId('note-text').getByRole('textbox').fill('persisted note');
    await page.getByTestId('add-note').click();
    await expect(page.getByTestId('notes')).toContainText('persisted note');

    await page.reload();
    await expect(page.getByTestId('notes')).toContainText('persisted note');

    await page.getByTestId('clear-notes').click();
    await expect(page.getByTestId('notes')).not.toContainText('persisted note');
  });
});

test.describe('browser APIs lab', () => {
  test('URL, History and File', async ({ page }) => {
    await page.goto('/technical-labs/browser-apis');

    // URL: parsed by the browser, relative to the base, repeated keys kept.
    await expect(page.getByTestId('url-href')).toHaveText(
      'https://customers.example.test/customers/42?tab=audit&tab=notes#top',
    );
    await expect(page.getByTestId('url-params')).toContainText('tab=audit');
    await expect(page.getByTestId('url-params')).toContainText('tab=notes');
    await page.getByTestId('url-input').getByRole('textbox').fill('https://elsewhere.test/x');
    await expect(page.getByTestId('url-origin')).toHaveText('A different origin');

    // History: an entry through the router, then back through the browser.
    await page.getByTestId('history-push').click();
    await expect(page).toHaveURL(/step=1/);
    await expect(page.getByTestId('history-state')).toHaveText('step 1');
    await page.getByTestId('history-push').click();
    await expect(page).toHaveURL(/step=2/);
    await page.getByTestId('history-back').click();
    await expect(page).toHaveURL(/step=1/);
    await expect(page.getByTestId('history-state')).toHaveText('step 1');

    // File: read in the page, never uploaded.
    await page.getByTestId('file-input').setInputFiles({
      name: 'hello.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await expect(page.getByTestId('file-size')).toHaveText('5 bytes');
    await expect(page.getByTestId('file-signature')).toHaveText('68 65 6c 6c 6f');
    await expect(page.getByTestId('file-sha256')).toHaveText(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    await expect(page.getByTestId('file-preview')).toHaveText('hello');
  });

  test('clipboard, permissions and geolocation, with permission granted', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write', 'geolocation'], {
      origin: baseURL,
    });
    await context.setGeolocation({ latitude: 21.0285, longitude: 105.8542, accuracy: 20 });
    await page.goto('/technical-labs/browser-apis');

    await page.getByTestId('clipboard-copy').click();
    await expect(page.getByTestId('clipboard-outcome')).toHaveText('Copied to the clipboard.');
    await page.getByTestId('clipboard-read').click();
    await expect(page.getByTestId('clipboard-outcome')).toHaveText('The clipboard holds: C-000042');

    await page.getByTestId('permissions-query').click();
    await expect(page.getByTestId('permission-geolocation')).toHaveText('Granted');

    await page.getByTestId('geolocation-locate').click();
    await expect(page.getByTestId('geolocation-outcome')).toContainText(
      'Latitude 21.0285, longitude 105.8542',
    );
  });

  test('geolocation refused is an answer, not an error', async ({ page }) => {
    await page.goto('/technical-labs/browser-apis');
    await page.getByTestId('geolocation-locate').click();
    await expect(page.getByTestId('geolocation-outcome')).toHaveText(
      'Location access was refused.',
    );
  });
});

test.describe('workers lab', () => {
  test('the same count in a worker leaves the page responsive', async ({ page }) => {
    await page.goto('/technical-labs/workers');

    await page.getByTestId('primes-main').click();
    const main = page.locator('[data-testid="primes-result"][data-where="main-thread"]');
    await expect(main).toContainText('1270607 primes', { timeout: 30_000 });

    await page.getByTestId('primes-worker').click();
    const worker = page.locator('[data-testid="primes-result"][data-where="worker"]');
    await expect(worker).toContainText('1270607 primes', { timeout: 30_000 });

    const longestFrame = async (text: string | null) => Number(text?.match(/took (\d+) ms/)?.[1]);
    expect(await longestFrame(await worker.textContent())).toBeLessThan(
      await longestFrame(await main.textContent()),
    );
  });

  test('the service worker is not registered by a development build', async ({ page }) => {
    await page.goto('/technical-labs/workers');
    await expect(page.getByTestId('sw-enabled')).toHaveText(
      'No - development builds do not register it',
    );
  });
});

test.describe('performance lab', () => {
  test('debouncing runs the search once per pause, not once per keystroke', async ({ page }) => {
    await page.goto('/technical-labs/performance');
    await page
      .getByTestId('rate-search')
      .getByRole('searchbox')
      .pressSequentially('anbel', { delay: 30 });

    await expect(page.getByTestId('debounced-scans')).toHaveText('1');
    await expect(page.getByTestId('immediate-scans')).toHaveText('5');
  });

  test('a computed signal is not recomputed by unrelated renders; a method is', async ({
    page,
  }) => {
    await page.goto('/technical-labs/performance');

    await page.getByTestId('derived-run-method').click();
    await expect(page.getByTestId('derived-result')).toContainText('recomputed 50 times');

    await page.getByTestId('derived-run-computed').click();
    await expect(page.getByTestId('derived-result')).toContainText('recomputed 0 times');
  });

  test('virtual scrolling keeps the DOM small whatever the list size', async ({ page }) => {
    await page.goto('/technical-labs/performance');
    // The demo is a deferred block: its code loads when it scrolls into view.
    await page.getByRole('heading', { name: 'Virtual scrolling' }).scrollIntoViewIfNeeded();

    await page.getByTestId('render-plain-10000').click();
    await expect(page.getByTestId('plain-list').locator('li')).toHaveCount(10_000);
    const plain = Number(await page.getByTestId('virtual-dom-elements').textContent());

    await page.getByTestId('render-virtual').click();
    await expect(page.getByTestId('virtual-list')).toBeVisible();
    await expect
      .poll(async () => Number(await page.getByTestId('virtual-dom-elements').textContent()))
      .toBeLessThan(200);
    expect(plain).toBeGreaterThan(10_000);
  });

  test('optimized images fetch WebP at the rendered size, not the original upload', async ({
    page,
  }) => {
    await page.goto('/technical-labs/performance');
    const requested: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/labs/images/')) {
        requested.push(request.url());
      }
    });

    await page.getByTestId('images-optimized').click();
    await expect(page.getByTestId('image-grid').locator('img').first()).toBeVisible();
    await expect.poll(() => requested.length).toBeGreaterThan(0);
    // A 16rem card needs the 400 px file (800 on a 2x screen), never the 1600.
    expect(requested.every((url) => /photo-(400|800)\.webp/.test(url))).toBe(true);
    // Lazy loading does not show here: Chromium fetches lazy images within
    // about 1250 px of the viewport, and the whole grid is that close.
    // docs/performance.md records the bytes; this asserts the choice of file.
  });
});

test.describe('offline lab and the offline banner', () => {
  test('offline: the banner shows, the list comes from the saved copy; online again: it refreshes', async ({
    page,
    context,
  }) => {
    await page.goto('/technical-labs/offline');
    await expect(page.getByTestId('directory-source')).toHaveAttribute('data-source', 'network');
    await expect(page.getByTestId('directory-rows').locator('tbody tr')).toHaveCount(25);

    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    await expect(page.getByTestId('lab-connectivity')).toHaveAttribute('data-online', 'false');

    await page.getByTestId('directory-refresh').click();
    await expect(page.getByTestId('directory-source')).toHaveAttribute('data-source', 'saved');
    await expect(page.getByTestId('directory-rows').locator('tbody tr')).toHaveCount(25);

    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);
    await expect(page.getByTestId('toasts')).toContainText('You are back online.');
    await expect(page.getByTestId('directory-source')).toHaveAttribute('data-source', 'network');
  });

  test('the saved copy can be deleted', async ({ page, context }) => {
    await page.goto('/technical-labs/offline');
    await expect(page.getByTestId('directory-source')).toHaveAttribute('data-source', 'network');
    await page.getByTestId('directory-forget').click();

    await context.setOffline(true);
    await page.getByTestId('directory-refresh').click();
    await expect(page.getByTestId('directory-source')).toHaveAttribute('data-source', 'none');
    await context.setOffline(false);
  });

  test('the saved copy is deleted when the session ends - even after leaving the lab', async ({
    page,
  }) => {
    await page.goto('/technical-labs/offline');
    await expect(page.getByTestId('directory-source')).toHaveAttribute('data-source', 'network');

    const savedCopy = () =>
      page.evaluate(
        () =>
          new Promise<unknown>((resolve) => {
            const open = indexedDB.open('ecm-lab-offline');
            open.onsuccess = () => {
              const read = open.result
                .transaction('snapshots')
                .objectStore('snapshots')
                .get('customers');
              read.onsuccess = () => {
                open.result.close();
                resolve(read.result ?? null);
              };
            };
          }),
      );
    await expect.poll(savedCopy).not.toBeNull();

    await page.getByRole('link', { name: 'Customers' }).first().click();
    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/login/);

    await expect.poll(savedCopy).toBeNull();
  });
});
