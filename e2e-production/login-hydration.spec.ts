import { expect, test } from '@playwright/test';

/**
 * Debt row 13: typing into the prerendered sign-in form before the
 * application is running must not be lost. Only the production build
 * prerenders `/login` ahead of time, so the test lives here - on a slowed
 * CPU and network, so there is time to type before hydration finishes.
 */
test('text typed before hydration survives it', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 200_000,
    uploadThroughput: 90_000,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto('/login', { waitUntil: 'commit' });
  const username = page.locator('input[name="username"]');
  await username.pressSequentially('admin', { delay: 30 });
  // The point of the test: the typing happened before the app was stable.
  expect(await page.evaluate(() => performance.getEntriesByName('ecm:app-stable').length)).toBe(0);

  await page.waitForFunction(
    () => performance.getEntriesByName('ecm:app-stable').length > 0,
    null,
    {
      timeout: 60_000,
    },
  );
  await expect(username).toHaveValue('admin');
});
